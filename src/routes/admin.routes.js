import { Router } from '../lib/router.js';
import { sendJson, notFound, badRequest, readJsonBody } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireRole, requireCsrf } from '../middleware/auth.js';
import { getUserRoles } from '../services/authService.js';
import { serializeUserAdmin } from '../lib/userSerializer.js';
import { notify } from '../services/notificationService.js';
import { audit, listAuditLogs } from '../services/auditService.js';

/**
 * Ein normaler Admin ist immer an seinen eigenen Tribe gebunden (req.user.tribe_id).
 * Der Developer hat keinen eigenen Tribe (tribe_id = NULL) und muss daher explizit
 * per ?tribeId= angeben, welchen Tribe er gerade administriert - es gibt keinen
 * impliziten "Standard-Tribe" fuer Blunt, das wuerde versehentliche Aktionen im
 * falschen Tribe riskieren.
 */
function effectiveTribeId(req) {
  if (req.user.roles.includes('developer') && req.query.tribeId) {
    return parseIdParam(req.query.tribeId, 'tribeId');
  }
  if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - bitte ?tribeId=<id> angeben');
  return req.user.tribe_id;
}

async function scopedMember(db, id, tribeId) {
  const user = await db.get('SELECT * FROM users WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!user) throw notFound('Mitglied nicht gefunden');
  return user;
}

export function buildAdminRouter(db) {
  const router = new Router();

  router.get('/api/admin/members', requireRole('admin'), async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const rows = await db.all('SELECT * FROM users WHERE tribe_id = ? ORDER BY status, username', [tribeId]);
    const members = [];
    for (const u of rows) members.push(serializeUserAdmin(u, { roles: await getUserRoles(db, u.id) }));
    sendJson(res, 200, { members });
  });

  router.patch('/api/admin/members/:id/approve', requireRole('admin'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const tribeId = effectiveTribeId(req);
    await db.transaction(async (tx) => {
      const member = await scopedMember(tx, id, tribeId);
      if (member.status !== 'pending_approval') throw badRequest('Mitglied wartet nicht auf Freischaltung');
      await tx.run(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      const memberRole = await tx.get(`SELECT id FROM roles WHERE key = 'member'`);
      await tx.run(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?,?) ON CONFLICT(user_id, role_id) DO NOTHING`,
        [id, memberRole.id]
      );
      await audit(tx, { tribeId, actorId: req.user.id, action: 'member_accepted', targetType: 'user', targetId: id });
      await notify(tx, { userId: id, tribeId, type: 'member_accepted', payload: {} });
    });
    sendJson(res, 200, { ok: true });
  });

  router.patch('/api/admin/members/:id/reject', requireRole('admin'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const tribeId = effectiveTribeId(req);
    await db.transaction(async (tx) => {
      const member = await scopedMember(tx, id, tribeId);
      if (member.status !== 'pending_approval') throw badRequest('Mitglied wartet nicht auf Freischaltung');
      await tx.run(`UPDATE users SET status = 'rejected', updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      await tx.run('DELETE FROM sessions WHERE user_id = ?', [id]);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'member_rejected', targetType: 'user', targetId: id });
    });
    sendJson(res, 200, { ok: true });
  });

  router.patch('/api/admin/members/:id/disable', requireRole('admin'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const tribeId = effectiveTribeId(req);
    await db.transaction(async (tx) => {
      await scopedMember(tx, id, tribeId);
      await tx.run(`UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      await tx.run('DELETE FROM sessions WHERE user_id = ?', [id]);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'member_disabled', targetType: 'user', targetId: id });
    });
    sendJson(res, 200, { ok: true });
  });

  router.patch('/api/admin/members/:id/roles', requireRole('admin'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const tribeId = effectiveTribeId(req);
    const body = await readJsonBody(req);
    // Vergebbar sind ausschliesslich TRIBE-Rollen. "developer" ist eine
    // plattformweite Rolle und darf hier bewusst NICHT gesetzt werden - sonst
    // koennte sich ein Tribe-Admin ueber einen praeparierten Request selbst zum
    // Plattform-Developer machen.
    const VERGEBBAR = { breederCrafter: 'breeder_crafter', admin: 'admin' };
    const gesetzt = Object.keys(VERGEBBAR).filter((k) => typeof body[k] === 'boolean');
    if (!gesetzt.length) throw badRequest('Mindestens ein Rollenfeld (breederCrafter, admin) als true/false angeben');

    await db.transaction(async (tx) => {
      await scopedMember(tx, id, tribeId);

      // Schutz: Der letzte Admin eines Tribes darf sich die Rolle nicht selbst
      // entziehen - der Tribe waere sonst dauerhaft ohne Verwaltung.
      if (body.admin === false) {
        const adminZahl = await tx.get(
          `SELECT COUNT(*) AS c FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           JOIN users u ON u.id = ur.user_id
           WHERE r.key = 'admin' AND u.tribe_id = ? AND u.status = 'active'`,
          [tribeId]
        );
        if (Number(adminZahl.c) <= 1) throw badRequest('Der letzte Admin des Tribes kann die Rolle nicht abgeben');
      }

      for (const feld of gesetzt) {
        const role = await tx.get('SELECT id FROM roles WHERE key = ?', [VERGEBBAR[feld]]);
        if (body[feld]) {
          await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (?,?) ON CONFLICT(user_id, role_id) DO NOTHING', [id, role.id]);
        } else {
          await tx.run('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [id, role.id]);
        }
      }
      await audit(tx, {
        tribeId,
        actorId: req.user.id,
        action: 'role_changed',
        targetType: 'user',
        targetId: id,
        meta: Object.fromEntries(gesetzt.map((k) => [k, body[k]])),
      });
    });
    sendJson(res, 200, { roles: await getUserRoles(db, id) });
  });

  router.get('/api/admin/audit-logs', requireRole('admin'), async (req, res) => {
    const tribeId = effectiveTribeId(req);
    const logs = await listAuditLogs(db, { tribeId, limit: 200 });
    sendJson(res, 200, { logs });
  });

  return router;
}
