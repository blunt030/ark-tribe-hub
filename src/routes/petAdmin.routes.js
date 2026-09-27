import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, notFound } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireRole, requireCsrf } from '../middleware/auth.js';
import { validateImage } from '../lib/imageUpload.js';
import { audit } from '../services/auditService.js';
import { config } from '../config.js';
import { KNOWN_SPECIES } from '../services/petService.js';
import {
  loadSettings, updateSettings, saleMissing, artMap, saveArt, deleteArt,
  grantUnlock, revokeUnlock, cleanGift, createGift, DEFAULT_SETTINGS,
} from '../services/petConfigService.js';
import { listPurchases } from '../services/petShopService.js';
import { stripeStatus } from '../services/stripeService.js';
import { overview, players, resetPlayer, listUnlocks, listGifts, deleteGift, readStripeState } from '../services/petAdminService.js';

/**
 * Tamagotchi-Verwaltung – nur für Developer. Hier stellt der Betreiber alles
 * ein: Gratis-Arten, Preise, Tierbilder, Verkauf, Events, Ankündigung,
 * Geschenke und Freischaltungen. Jede Änderung landet im Audit-Log.
 */
export function buildPetAdminRouter(db) {
  const router = new Router();
  const dev = requireRole('developer');

  function species(raw) {
    const key = String(raw || '');
    if (!KNOWN_SPECIES.has(key)) throw badRequest('Unbekannte Art', 'VALIDATION_ERROR');
    return key;
  }

  async function user(id) {
    const row = await db.get('SELECT id, username FROM users WHERE id = ?', [id]);
    if (!row) throw notFound('Benutzer nicht gefunden');
    return row;
  }

  async function state() {
    const settings = await loadSettings(db);
    return {
      settings,
      art: await artMap(db),
      stripe: { ...stripeStatus(), last: await readStripeState(db) },
      webhookUrl: `${config.publicUrl.replace(/\/+$/, '')}/api/stripe/webhook`,
      saleMissing: saleMissing(settings.sale),
      defaults: { free: DEFAULT_SETTINGS.roster.free, price: DEFAULT_SETTINGS.sale.price },
    };
  }

  router.get('/api/developer/pet', dev, async (req, res) => {
    sendJson(res, 200, await state());
  });

  router.get('/api/developer/pet/overview', dev, async (req, res) => {
    sendJson(res, 200, { overview: await overview(db), stripe: { ...stripeStatus(), last: await readStripeState(db) } });
  });

  router.patch('/api/developer/pet/settings', dev, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    await updateSettings(db, body, req.user.id);
    await audit(db, { actorId: req.user.id, action: 'pet_settings_updated', targetType: 'pet_settings', meta: { areas: Object.keys(body).filter((k) => ['roster', 'sale', 'game'].includes(k)) } });
    sendJson(res, 200, await state());
  });

  // Tierbild hochladen (Freisteller als PNG/WebP) samt Angaben zu Blickrichtung,
  // Kopf, Maul, Fußlinie und Größe.
  router.post('/api/developer/pet/art/:species', dev, requireCsrf, async (req, res) => {
    const key = species(req.params.species);
    const body = await readJsonBody(req);
    const { buffer, mimeType, width, height } = validateImage({ base64: body.imageBase64, mimeType: body.mimeType });
    const meta = { ...(body.meta || {}), w: width, h: height };
    await saveArt(db, key, { meta, buffer, mime: mimeType }, req.user.id);
    await audit(db, { actorId: req.user.id, action: 'pet_art_uploaded', targetType: 'pet_species', meta: { species: key, width, height } });
    sendJson(res, 200, await state());
  });

  // Nur die Angaben ändern (z. B. Kopfposition eines mitgelieferten Bildes).
  router.patch('/api/developer/pet/art/:species', dev, requireCsrf, async (req, res) => {
    const key = species(req.params.species);
    const body = await readJsonBody(req);
    await saveArt(db, key, { meta: body.meta }, req.user.id);
    await audit(db, { actorId: req.user.id, action: 'pet_art_adjusted', targetType: 'pet_species', meta: { species: key } });
    sendJson(res, 200, await state());
  });

  router.delete('/api/developer/pet/art/:species', dev, requireCsrf, async (req, res) => {
    const key = species(req.params.species);
    if (!(await deleteArt(db, key))) throw notFound('Kein eigenes Bild vorhanden');
    await audit(db, { actorId: req.user.id, action: 'pet_art_deleted', targetType: 'pet_species', meta: { species: key } });
    sendJson(res, 200, await state());
  });

  router.get('/api/developer/pet/purchases', dev, async (req, res) => {
    sendJson(res, 200, { purchases: await listPurchases(db), unlocks: await listUnlocks(db) });
  });

  // Art schenken (ohne Kauf freischalten)
  router.post('/api/developer/pet/unlocks', dev, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const target = await user(parseIdParam(body.userId, 'userId'));
    const key = species(body.species);
    const added = await grantUnlock(db, { userId: target.id, species: key, source: 'gift', ref: 'Geschenk', by: req.user.id });
    await audit(db, { actorId: req.user.id, action: 'pet_species_granted', targetType: 'user', targetId: target.id, meta: { species: key } });
    sendJson(res, added ? 201 : 200, { added });
  });

  router.delete('/api/developer/pet/unlocks/:userId/:species', dev, requireCsrf, async (req, res) => {
    const target = await user(parseIdParam(req.params.userId, 'userId'));
    const key = species(req.params.species);
    if (!(await revokeUnlock(db, target.id, key))) throw notFound('Keine Freischaltung vorhanden');
    await audit(db, { actorId: req.user.id, action: 'pet_species_revoked', targetType: 'user', targetId: target.id, meta: { species: key } });
    sendJson(res, 200, { removed: true });
  });

  router.get('/api/developer/pet/players', dev, async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 40) : '';
    sendJson(res, 200, { players: await players(db, { search }) });
  });

  // Spielstand eines Kontos zurücksetzen (Support); Freischaltungen bleiben.
  router.delete('/api/developer/pet/players/:userId', dev, requireCsrf, async (req, res) => {
    const target = await user(parseIdParam(req.params.userId, 'userId'));
    const removed = await resetPlayer(db, target.id);
    await audit(db, { actorId: req.user.id, action: 'pet_state_reset', targetType: 'user', targetId: target.id });
    sendJson(res, 200, { removed });
  });

  router.get('/api/developer/pet/gifts', dev, async (req, res) => {
    sendJson(res, 200, { gifts: await listGifts(db) });
  });

  // Geschenk an ein Konto (userId) oder an alle (userId: null)
  router.post('/api/developer/pet/gifts', dev, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const gift = cleanGift(body);
    const target = body.userId === null || body.userId === undefined ? null : await user(parseIdParam(body.userId, 'userId'));
    const id = await createGift(db, { userId: target?.id ?? null, gift, by: req.user.id });
    await audit(db, { actorId: req.user.id, action: 'pet_gift_created', targetType: target ? 'user' : 'pet_gift', targetId: target?.id ?? id, meta: { shards: gift.shards, items: gift.items } });
    sendJson(res, 201, { id, gifts: await listGifts(db) });
  });

  router.delete('/api/developer/pet/gifts/:id', dev, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!(await deleteGift(db, id))) throw notFound('Geschenk nicht gefunden');
    await audit(db, { actorId: req.user.id, action: 'pet_gift_deleted', targetType: 'pet_gift', targetId: id });
    sendJson(res, 200, { gifts: await listGifts(db) });
  });

  return router;
}
