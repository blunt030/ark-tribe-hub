import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, forbidden, notFound } from '../lib/http.js';
import { requireString, parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf, requireRole } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { decryptAccessPin } from '../services/accessPinService.js';

function tribe(req) {
  if (!req.user.tribe_id) throw forbidden('Kein eigener Tribe vorhanden');
  return req.user.tribe_id;
}
const isAdmin = (req) => req.user.roles.includes('admin') || req.user.roles.includes('developer');

/** Freitextfeld am Benutzer synchron halten (Mails, aeltere Ansichten). */
async function syncUserVaultNumber(tx, userId) {
  if (!userId) return;
  const rows = await tx.all('SELECT name FROM tribe_vaults WHERE assigned_user_id = ? ORDER BY name', [userId]);
  await tx.run('UPDATE users SET personal_vault_number = ?, updated_at = ? WHERE id = ?',
    [rows.map((r) => r.name).join(', ').slice(0, 200) || null, new Date().toISOString(), userId]);
}

async function checkAssignee(tx, tribeId, raw) {
  if (raw === null || raw === '' || raw === undefined) return null;
  const id = parseIdParam(String(raw), 'assignedUserId');
  const user = await tx.get(`SELECT id FROM users WHERE id = ? AND tribe_id = ? AND status = 'active'`, [id, tribeId]);
  if (!user) throw badRequest('Mitglied gehört nicht zu diesem Tribe');
  return id;
}

export function buildVaultRouter(db) {
  const router = new Router();

  // Admins sehen alle Vaults mit Zuweisung und dem vom Mitglied gesetzten PIN;
  // Mitglieder sehen nur ihre eigenen Vaults.
  router.get('/api/vaults', requireActive, async (req, res) => {
    const tribeId = tribe(req);
    const admin = isAdmin(req);
    const rows = await db.all(
      `SELECT v.id, v.name, v.note, v.assigned_user_id, v.created_at, u.username AS assigned_username, u.personal_pin_encrypted
       FROM tribe_vaults v LEFT JOIN users u ON u.id = v.assigned_user_id
       WHERE v.tribe_id = ?${admin ? '' : ' AND v.assigned_user_id = ?'} ORDER BY v.name`,
      admin ? [tribeId] : [tribeId, req.user.id]
    );
    const vaults = rows.map(({ personal_pin_encrypted, ...v }) => ({
      ...v,
      ...(admin ? { pinSet: Boolean(personal_pin_encrypted), pin: decryptAccessPin(personal_pin_encrypted) } : {}),
    }));
    sendJson(res, 200, { vaults });
  });

  router.post('/api/vaults', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = tribe(req);
    const body = await readJsonBody(req);
    const name = requireString(body.name, 'name', { max: 50 });
    const note = body.note ? String(body.note).trim().slice(0, 200) : null;
    const vault = await db.transaction(async (tx) => {
      if (await tx.get('SELECT id FROM tribe_vaults WHERE tribe_id = ? AND name = ?', [tribeId, name])) throw badRequest('Diesen Vault gibt es bereits');
      const assignee = await checkAssignee(tx, tribeId, body.assignedUserId);
      const row = await tx.get('INSERT INTO tribe_vaults (tribe_id, name, note, assigned_user_id) VALUES (?,?,?,?) RETURNING *', [tribeId, name, note, assignee]);
      await syncUserVaultNumber(tx, assignee);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'vault_created', targetType: 'vault', targetId: row.id, meta: { name } });
      return row;
    });
    sendJson(res, 201, { vault });
  });

  router.patch('/api/vaults/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = tribe(req);
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const vault = await db.transaction(async (tx) => {
      const before = await tx.get('SELECT * FROM tribe_vaults WHERE id = ? AND tribe_id = ?', [id, tribeId]);
      if (!before) throw notFound('Vault nicht gefunden');
      const name = body.name !== undefined ? requireString(body.name, 'name', { max: 50 }) : before.name;
      if (name !== before.name && await tx.get('SELECT id FROM tribe_vaults WHERE tribe_id = ? AND name = ? AND id <> ?', [tribeId, name, id])) throw badRequest('Diesen Vault gibt es bereits');
      const note = body.note !== undefined ? (String(body.note || '').trim().slice(0, 200) || null) : before.note;
      const assignee = body.assignedUserId !== undefined ? await checkAssignee(tx, tribeId, body.assignedUserId) : before.assigned_user_id;
      const row = await tx.get('UPDATE tribe_vaults SET name = ?, note = ?, assigned_user_id = ? WHERE id = ? RETURNING *', [name, note, assignee, id]);
      await syncUserVaultNumber(tx, before.assigned_user_id);
      if (assignee !== before.assigned_user_id) await syncUserVaultNumber(tx, assignee);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'vault_updated', targetType: 'vault', targetId: id, meta: { assignee } });
      return row;
    });
    sendJson(res, 200, { vault });
  });

  router.delete('/api/vaults/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = tribe(req);
    const id = parseIdParam(req.params.id);
    await db.transaction(async (tx) => {
      const before = await tx.get('SELECT * FROM tribe_vaults WHERE id = ? AND tribe_id = ?', [id, tribeId]);
      if (!before) throw notFound('Vault nicht gefunden');
      await tx.run('DELETE FROM tribe_vaults WHERE id = ?', [id]);
      await syncUserVaultNumber(tx, before.assigned_user_id);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'vault_deleted', targetType: 'vault', targetId: id, meta: { name: before.name } });
    });
    sendJson(res, 200, { ok: true });
  });

  // Online-Status: aktiv = Sitzung in den letzten 5 Minuten benutzt. Nur
  // Anzahlen und IDs des eigenen Tribes, keine Zeitstempel.
  router.get('/api/presence', requireActive, async (req, res) => {
    const tribeId = tribe(req);
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const members = await db.all(`SELECT id FROM users WHERE tribe_id = ? AND status = 'active'`, [tribeId]);
    const online = await db.all(
      `SELECT DISTINCT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.tribe_id = ? AND u.status = 'active' AND s.last_seen_at >= ?`, [tribeId, cutoff]);
    const onlineIds = online.map((r) => Number(r.user_id));
    sendJson(res, 200, { online: onlineIds, onlineCount: onlineIds.length, total: members.length, offlineCount: Math.max(0, members.length - onlineIds.length) });
  });

  return router;
}
