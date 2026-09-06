import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import * as inventoryService from '../services/inventoryService.js';

export function buildInventoryRouter(db) {
  const router = new Router();

  function tribeIdOf(req) {
    if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - Developer hat keinen eigenen Bestand');
    return req.user.tribe_id;
  }

  router.get('/api/inventory', requireActive, async (req, res) => {
    const items = await inventoryService.listInventory(db, tribeIdOf(req), {
      location: req.query.location,
      onlyLow: req.query.onlyLow === '1',
    });
    sendJson(res, 200, { items });
  });

  router.get('/api/inventory/locations', requireActive, async (req, res) => {
    sendJson(res, 200, { locations: await inventoryService.listLocations(db, tribeIdOf(req)) });
  });

  router.post('/api/inventory', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const item = await inventoryService.createEntry(db, tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { item });
  });

  router.patch('/api/inventory/:id', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const item = await inventoryService.updateEntry(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 200, { item });
  });

  router.post('/api/inventory/:id/adjust', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const delta = parseInt(body.delta, 10);
    if (!Number.isInteger(delta)) throw badRequest('delta muss eine Ganzzahl sein');
    const item = await inventoryService.adjustQuantity(db, parseIdParam(req.params.id), tribeIdOf(req), delta, req.user.id);
    sendJson(res, 200, { item });
  });

  router.delete('/api/inventory/:id', requireActive, requireCsrf, async (req, res) => {
    await inventoryService.deleteEntry(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  return router;
}
