import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound } from '../lib/http.js';
import { requireString } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

export function buildTribesRouter(db) {
  const router = new Router();

  router.get('/api/tribes/me', requireActive, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet (Plattform-Account)');
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [req.user.tribe_id]);
    if (!tribe) throw notFound('Tribe nicht gefunden');
    sendJson(res, 200, { tribe });
  });

  // Admins dürfen den Namen ihres EIGENEN Tribes pflegen. Anlegen/Deaktivieren
  // ganzer Tribes bleibt Blunt (Developer) vorbehalten, siehe developer.routes.js.
  router.patch('/api/tribes/me', requireRole('admin'), requireCsrf, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet');
    const body = await readJsonBody(req);
    const name = requireString(body.name, 'name', { min: 2, max: 60 });
    await db.run(`UPDATE tribes SET name = ?, updated_at = ? WHERE id = ?`, [name, new Date().toISOString(), req.user.tribe_id]);
    await audit(db, { tribeId: req.user.tribe_id, actorId: req.user.id, action: 'tribe_updated', targetType: 'tribe', targetId: req.user.tribe_id });
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [req.user.tribe_id]);
    sendJson(res, 200, { tribe });
  });

  return router;
}
