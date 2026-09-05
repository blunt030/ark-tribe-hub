import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest } from '../lib/http.js';
import { requireOneOf, parseIdParam, optionalString } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import * as newsService from '../services/newsService.js';
import { NEWS_PRIORITIES } from '../services/newsService.js';

/** Admin ist an seinen eigenen Tribe gebunden; Developer kann per ?tribeId= gezielt
 *  einen fremden Tribe verwalten (gleiches Muster wie admin.routes.js). */
function effectiveTribeId(req) {
  if (req.user.roles.includes('developer') && req.query.tribeId) {
    return parseIdParam(req.query.tribeId, 'tribeId');
  }
  if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - bitte ?tribeId=<id> angeben');
  return req.user.tribe_id;
}

export function buildNewsRouter(db) {
  const router = new Router();

  // Öffentlich für alle aktiven Mitglieder des eigenen Tribes: nur was gerade laeuft.
  router.get('/api/news', requireActive, async (req, res) => {
    if (!req.user.tribe_id) return sendJson(res, 200, { news: [] }); // Developer hat keinen eigenen Tribe
    const news = await newsService.listActiveNews(db, req.user.tribe_id);
    sendJson(res, 200, { news });
  });

  // Admin-Verwaltung: auch inaktive/abgelaufene Eintraege, zum Pflegen.
  router.get('/api/admin/news', requireRole('admin'), async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const news = await newsService.listAllNews(db, tribeId);
    sendJson(res, 200, { news });
  });

  router.post('/api/admin/news', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const body = await readJsonBody(req);
    const priority = body.priority ? requireOneOf(body.priority, NEWS_PRIORITIES, 'priority') : 'normal';
    const news = await newsService.createNews(db, {
      tribeId,
      body: body.body,
      priority,
      startsAt: optionalString(body.startsAt, 'startsAt', { max: 40 }),
      endsAt: optionalString(body.endsAt, 'endsAt', { max: 40 }),
      actorId: req.user.id,
    });
    sendJson(res, 201, { news });
  });

  router.patch('/api/admin/news/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const updates = {};
    if (body.body !== undefined) updates.body = body.body;
    if (body.priority !== undefined) updates.priority = requireOneOf(body.priority, NEWS_PRIORITIES, 'priority');
    if (body.isActive !== undefined) updates.isActive = !!body.isActive;
    if (body.startsAt !== undefined) updates.startsAt = body.startsAt;
    if (body.endsAt !== undefined) updates.endsAt = body.endsAt;
    const news = await newsService.updateNews(db, id, tribeId, updates, req.user.id);
    sendJson(res, 200, { news });
  });

  router.delete('/api/admin/news/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const id = parseIdParam(req.params.id);
    await newsService.deleteNews(db, id, tribeId, req.user.id);
    sendJson(res, 200, { ok: true });
  });

  return router;
}
