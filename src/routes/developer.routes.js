import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound, conflict, badRequest } from '../lib/http.js';
import { requireString, requireOneOf, parseIdParam } from '../lib/validate.js';
import { requireRole, requireCsrf } from '../middleware/auth.js';
import { getUserRoles } from '../services/authService.js';
import { audit, listAuditLogs } from '../services/auditService.js';

const ALL_ROLES = ['member', 'breeder_crafter', 'admin', 'developer'];

export function buildDeveloperRouter(db) {
  const router = new Router();

  router.get('/api/developer/tribes', requireRole('developer'), async (req, res) => {
    sendJson(res, 200, { tribes: await db.all('SELECT * FROM tribes ORDER BY name') });
  });

  router.post('/api/developer/tribes', requireRole('developer'), requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const slug = requireString(body.slug, 'slug', { min: 2, max: 50 }).toLowerCase();
    const name = requireString(body.name, 'name', { min: 2, max: 60 });
    if (!/^[a-z0-9-]+$/.test(slug)) throw badRequest('slug darf nur Kleinbuchstaben, Ziffern und "-" enthalten');

    const result = await db.transaction(async (tx) => {
      const existing = await tx.get('SELECT id FROM tribes WHERE slug = ?', [slug]);
      if (existing) throw conflict('Tribe-Slug existiert bereits');
      const inserted = await tx.get('INSERT INTO tribes (slug, name) VALUES (?,?) RETURNING id', [slug, name]);
      await audit(tx, { actorId: req.user.id, action: 'tribe_created', targetType: 'tribe', targetId: inserted.id });
      return tx.get('SELECT * FROM tribes WHERE id = ?', [inserted.id]);
    });
    sendJson(res, 201, { tribe: result });
  });

  router.patch('/api/developer/tribes/:id', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [id]);
    if (!tribe) throw notFound('Tribe nicht gefunden');

    await db.transaction(async (tx) => {
      if (body.name !== undefined) {
        await tx.run('UPDATE tribes SET name = ? WHERE id = ?', [requireString(body.name, 'name', { min: 2, max: 60 }), id]);
      }
      if (body.isActive !== undefined) {
        await tx.run('UPDATE tribes SET is_active = ? WHERE id = ?', [body.isActive ? 1 : 0, id]);
      }
      await tx.run(`UPDATE tribes SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      await audit(tx, { actorId: req.user.id, action: 'tribe_updated', targetType: 'tribe', targetId: id, meta: body });
    });
    sendJson(res, 200, { tribe: await db.get('SELECT * FROM tribes WHERE id = ?', [id]) });
  });

  router.get('/api/developer/users', requireRole('developer'), async (req, res) => {
    const tribeId = req.query.tribeId ? parseIdParam(req.query.tribeId, 'tribeId') : null;
    const rows = tribeId
      ? await db.all('SELECT * FROM users WHERE tribe_id = ? ORDER BY username', [tribeId])
      : await db.all('SELECT * FROM users ORDER BY tribe_id, username');
    const users = [];
    for (const u of rows) users.push({ ...u, roles: await getUserRoles(db, u.id) });
    sendJson(res, 200, { users });
  });

  // Einzige Stelle, an der Admin- oder Developer-Rechte vergeben werden können.
  // Ersetzt die komplette Rollenliste eines Benutzers (bewusst explizit, damit nie
  // "versehentlich" nur eine Rolle hinzugefügt statt ersetzt wird).
  router.patch('/api/developer/users/:id/roles', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    if (!Array.isArray(body.roles) || body.roles.length === 0) throw badRequest('roles[] fehlt');
    for (const r of body.roles) requireOneOf(r, ALL_ROLES, 'roles[]');

    await db.transaction(async (tx) => {
      const user = await tx.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) throw notFound('Benutzer nicht gefunden');
      await tx.run('DELETE FROM user_roles WHERE user_id = ?', [id]);
      for (const r of new Set(body.roles)) {
        const role = await tx.get('SELECT id FROM roles WHERE key = ?', [r]);
        await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [id, role.id]);
      }
      await audit(tx, {
        tribeId: user.tribe_id,
        actorId: req.user.id,
        action: 'roles_replaced',
        targetType: 'user',
        targetId: id,
        meta: { roles: body.roles },
      });
    });
    sendJson(res, 200, { roles: await getUserRoles(db, id) });
  });

  router.get('/api/developer/audit-logs', requireRole('developer'), async (req, res) => {
    const tribeId = req.query.tribeId ? parseIdParam(req.query.tribeId, 'tribeId') : undefined;
    sendJson(res, 200, { logs: await listAuditLogs(db, { tribeId, limit: 300 }) });
  });

  return router;
}
