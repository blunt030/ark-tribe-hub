import { Router } from '../lib/router.js';
import { readJsonBody, readRawBody, sendJson, badRequest, forbidden, notFound } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import { loadPet, savePet, tribePets, validatePetDoc, KNOWN_SPECIES } from '../services/petService.js';
import { playerConfig, speciesCheck, claimGift, artImage } from '../services/petConfigService.js';
import { startCheckout, confirmCheckout, handleStripeEvent } from '../services/petShopService.js';
import { verifyWebhook, isSessionId, StripeError } from '../services/stripeService.js';
import { writeStripeState } from '../services/petAdminService.js';

/**
 * Dino-Tamagotchi. Jedes freigeschaltete Konto hat genau einen Spielstand –
 * auch Developer ohne Tribe. Das Gehege zeigt nur Tiere des eigenen Tribes.
 * serverTime erlaubt dem Browser, eine falsch gehende Geräteuhr auszugleichen.
 * `config` enthält, was der Betreiber eingestellt hat (Gratis-Arten, Preise,
 * Bilder, Events, Ankündigung) und die Freischaltungen und Geschenke des Kontos.
 */
export function buildPetRouter(db) {
  const router = new Router();

  router.get('/api/pet', requireActive, async (req, res) => {
    const { doc, revision } = await loadPet(db, req.user.id);
    sendJson(res, 200, { doc, revision, serverTime: Date.now(), config: await playerConfig(db, req.user) });
  });

  router.put('/api/pet', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const base = body.baseRevision;
    if (!Number.isSafeInteger(base) || base < 0) throw badRequest('baseRevision fehlt oder ist ungültig', 'VALIDATION_ERROR');
    const state = validatePetDoc(body.doc);
    const check = await speciesCheck(db, req.user, body.doc);
    const result = await savePet(db, req.user.id, state, base, { check });
    if (!result.ok) {
      sendJson(res, 409, {
        error: { code: 'CONFLICT', message: 'Der Spielstand wurde auf einem anderen Gerät geändert.' },
        doc: result.doc, revision: result.revision, serverTime: Date.now(),
      });
      return;
    }
    sendJson(res, 200, { revision: result.revision, serverTime: Date.now() });
  });

  router.get('/api/pet/config', requireActive, async (req, res) => {
    sendJson(res, 200, { config: await playerConfig(db, req.user), serverTime: Date.now() });
  });

  router.get('/api/pet/tribe', requireActive, async (req, res) => {
    if (!req.user.tribe_id) throw forbidden('Kein eigener Tribe vorhanden');
    sendJson(res, 200, { pets: await tribePets(db, req.user.tribe_id), serverTime: Date.now() });
  });

  // Vom Betreiber hochgeladene Tierbilder. Die Adresse enthält einen
  // Versionsstempel (?v=…), daher darf der Browser lange zwischenspeichern.
  router.get('/api/pet/art/:species', requireActive, async (req, res) => {
    const species = String(req.params.species || '');
    if (!KNOWN_SPECIES.has(species)) throw notFound('Bild nicht gefunden');
    const img = await artImage(db, species);
    if (!img) throw notFound('Bild nicht gefunden');
    res.writeHead(200, {
      'Content-Type': img.mime,
      'Content-Length': img.buffer.length,
      'Cache-Control': 'private, max-age=2592000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(img.buffer);
  });

  // Geschenk des Betreibers annehmen: Der Server schreibt es in den Spielstand.
  router.post('/api/pet/gifts/:id/claim', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 1) throw badRequest('baseRevision fehlt oder ist ungültig', 'VALIDATION_ERROR');
    const result = await claimGift(db, req.user.id, id, body.baseRevision);
    if (!result.ok) {
      sendJson(res, 409, {
        error: { code: 'CONFLICT', message: 'Der Spielstand wurde inzwischen geändert.' },
        doc: result.doc, revision: result.revision, serverTime: Date.now(),
      });
      return;
    }
    sendJson(res, 200, { doc: result.doc, revision: result.revision, given: result.given, serverTime: Date.now() });
  });

  // Kauf einer Art starten (Stripe Checkout). Die Zustimmung zur sofortigen
  // Freischaltung (Verlust des Widerrufsrechts) muss ausdrücklich vorliegen.
  router.post('/api/pet/checkout', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const species = String(body.species || '');
    if (!KNOWN_SPECIES.has(species)) throw badRequest('Unbekannte Art', 'VALIDATION_ERROR');
    if (body.consent !== true) throw badRequest('Bitte der sofortigen Freischaltung zustimmen.', 'CONSENT_REQUIRED');
    const locale = ['de', 'en', 'fr', 'es'].includes(body.lang) ? body.lang : 'auto';
    const session = await startCheckout(db, req.user, species, { locale });
    sendJson(res, 200, { url: session.url });
  });

  router.post('/api/pet/checkout/confirm', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    if (!isSessionId(body.sessionId)) throw badRequest('Ungültige Sitzung', 'VALIDATION_ERROR');
    const { status, species } = await confirmCheckout(db, req.user, body.sessionId);
    sendJson(res, 200, { result: status, species, config: await playerConfig(db, req.user) });
  });

  // Stripe meldet Zahlungen. Ohne Anmeldung, dafür mit geprüfter Signatur
  // über den unveränderten Body.
  router.post('/api/stripe/webhook', async (req, res) => {
    const raw = await readRawBody(req);
    let event;
    try {
      event = verifyWebhook(raw, req.headers['stripe-signature']);
    } catch (err) {
      if (err instanceof StripeError) throw badRequest('Signatur ungültig', 'BAD_SIGNATURE');
      throw err;
    }
    const result = await handleStripeEvent(db, event);
    await writeStripeState(db, { at: new Date().toISOString(), type: String(event.type || '').slice(0, 60), livemode: Boolean(event.livemode) });
    sendJson(res, 200, { received: true, handled: Boolean(result?.handled) });
  });

  return router;
}
