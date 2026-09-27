import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, forbidden } from '../lib/http.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import { loadPet, savePet, tribePets, validatePetDoc } from '../services/petService.js';

/**
 * Dino-Tamagotchi. Jedes freigeschaltete Konto hat genau einen Spielstand –
 * auch Developer ohne Tribe. Das Gehege zeigt nur Tiere des eigenen Tribes.
 * serverTime erlaubt dem Browser, eine falsch gehende Geräteuhr auszugleichen.
 */
export function buildPetRouter(db) {
  const router = new Router();

  router.get('/api/pet', requireActive, async (req, res) => {
    const { doc, revision } = await loadPet(db, req.user.id);
    sendJson(res, 200, { doc, revision, serverTime: Date.now() });
  });

  router.put('/api/pet', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const base = body.baseRevision;
    if (!Number.isSafeInteger(base) || base < 0) throw badRequest('baseRevision fehlt oder ist ungültig', 'VALIDATION_ERROR');
    const state = validatePetDoc(body.doc);
    const result = await savePet(db, req.user.id, state, base);
    if (!result.ok) {
      sendJson(res, 409, {
        error: { code: 'CONFLICT', message: 'Der Spielstand wurde auf einem anderen Gerät geändert.' },
        doc: result.doc, revision: result.revision, serverTime: Date.now(),
      });
      return;
    }
    sendJson(res, 200, { revision: result.revision, serverTime: Date.now() });
  });

  router.get('/api/pet/tribe', requireActive, async (req, res) => {
    if (!req.user.tribe_id) throw forbidden('Kein eigener Tribe vorhanden');
    sendJson(res, 200, { pets: await tribePets(db, req.user.tribe_id), serverTime: Date.now() });
  });

  return router;
}
