import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, notFound } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import * as notificationService from '../services/notificationService.js';

export function buildNotificationsRouter(db) {
  const router = new Router();

  router.get('/api/notifications', requireActive, async (req, res) => {
    const unreadOnly = req.query.unreadOnly === 'true';
    const notifications = await notificationService.listForUser(db, req.user.id, { unreadOnly });
    sendJson(res, 200, { notifications });
  });

  router.patch('/api/notifications/:id/read', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    await notificationService.markRead(db, req.user.id, id);
    sendJson(res, 200, { ok: true });
  });

  // Einzelne Meldung entfernen. Die Besitzpruefung steckt in der Abfrage selbst
  // (user_id), deshalb kann niemand fremde Meldungen loeschen.
  router.delete('/api/notifications/:id', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const geloescht = await notificationService.remove(db, id, req.user.id);
    if (!geloescht) throw notFound('Mitteilung nicht gefunden');
    sendJson(res, 200, { ok: true });
  });

  // Alle bereits gelesenen auf einmal aufraeumen.
  router.post('/api/notifications/clear-read', requireActive, requireCsrf, async (req, res) => {
    const anzahl = await notificationService.removeAllRead(db, req.user.id);
    sendJson(res, 200, { removed: anzahl });
  });

  router.post('/api/notifications/read-all', requireActive, requireCsrf, async (req, res) => {
    await notificationService.markAllRead(db, req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/notifications/preferences', requireActive, async (req, res) => {
    sendJson(res, 200, { preferences: await notificationService.getPreferences(db, req.user.id) });
  });

  router.put('/api/notifications/preferences', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    if (!Array.isArray(body.preferences)) throw badRequest('preferences[] fehlt');
    for (const p of body.preferences) {
      if (typeof p.type !== 'string' || typeof p.enabled !== 'boolean') {
        throw badRequest('Jede Präferenz braucht "type" (string) und "enabled" (boolean)');
      }
    }
    const preferences = await notificationService.setPreferences(db, req.user.id, body.preferences);
    sendJson(res, 200, { preferences });
  });

  return router;
}
