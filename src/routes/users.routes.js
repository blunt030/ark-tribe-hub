import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound, badRequest, unauthorized } from '../lib/http.js';
import { optionalString, requireEmail, parseIdParam, requirePassword } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import { getUserRoles } from '../services/authService.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { validateImage, saveImageToDisk } from '../lib/imageUpload.js';
import { audit } from '../services/auditService.js';
import { config } from '../config.js';

/** Server/Map dürfen laut Spezifikation nur der Nutzer selbst sowie Admins/Breeder-Crafter
 *  des gleichen Tribes sehen – normale Mitglieder nicht. */
function canSeeServerMap(target, requester) {
  if (requester.id === target.id) return true;
  if (requester.roles.includes('developer')) return true;
  if (requester.tribe_id !== target.tribe_id) return false;
  return requester.roles.includes('admin') || requester.roles.includes('breeder_crafter');
}

async function serializeProfile(db, target, requester) {
  const roles = target.roles || (await getUserRoles(db, target.id));
  const out = {
    id: target.id,
    tribeId: target.tribe_id,
    username: target.username,
    status: requester.id === target.id || requester.roles.includes('developer') ? target.status : undefined,
    roles,
    avatarPath: target.avatar_path,
    personalVaultNumber: target.personal_vault_number,
  };
  if (canSeeServerMap(target, requester)) {
    out.server = target.server;
    out.map = target.map;
  }
  if (requester.id === target.id) {
    out.email = target.email;
  }
  return out;
}

export function buildUsersRouter(db) {
  const router = new Router();

  router.get('/api/users/me', requireActive, async (req, res) => {
    sendJson(res, 200, { user: await serializeProfile(db, req.user, req.user) });
  });

  router.patch('/api/users/me', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const updates = {};
    if (body.server !== undefined) updates.server = optionalString(body.server, 'server', { max: 100 });
    if (body.map !== undefined) updates.map = optionalString(body.map, 'map', { max: 100 });
    if (body.personalVaultNumber !== undefined) {
      updates.personal_vault_number = optionalString(body.personalVaultNumber, 'personalVaultNumber', { max: 50 });
    }
    if (body.email !== undefined) updates.email = body.email ? requireEmail(body.email) : null;

    const fields = Object.keys(updates);
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      await db.run(`UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`, [
        ...fields.map((f) => updates[f]),
        new Date().toISOString(),
        req.user.id,
      ]);
    }
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    sendJson(res, 200, { user: await serializeProfile(db, { ...updated, roles: req.user.roles }, req.user) });
  });

  // Passwortwechsel. Verlangt bewusst das AKTUELLE Passwort: sonst könnte jemand
  // mit einer gekaperten offenen Sitzung das Konto dauerhaft übernehmen. Nach dem
  // Wechsel werden alle ANDEREN Sitzungen beendet - wer das alte Passwort kannte,
  // fliegt damit sofort raus, die eigene Sitzung bleibt aber bestehen.
  router.post('/api/users/me/password', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const currentPassword = body.currentPassword || '';
    const newPassword = requirePassword(body.newPassword);

    const me = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = await verifyPassword(currentPassword, me.password_hash);
    if (!ok) throw unauthorized('Das aktuelle Passwort stimmt nicht');
    if (currentPassword === newPassword) throw badRequest('Das neue Passwort muss sich vom bisherigen unterscheiden');

    const newHash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await tx.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', [req.user.id, req.session.id]);
      await audit(tx, { tribeId: req.user.tribe_id, actorId: req.user.id, action: 'password_changed', targetType: 'user', targetId: req.user.id });
    });
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/users/me/avatar', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const { buffer, ext, mimeType } = validateImage({ base64: body.imageBase64, mimeType: body.mimeType });
    const relPath = `avatars/${req.user.id}.${ext}`;
    const nowIso = new Date().toISOString();

    if (db.kind === 'postgres') {
      // Kein persistenter lokaler Speicher auf dem Hosting -> Bild landet als
      // Blob direkt in der (dort dauerhaften) Datenbank statt auf der Festplatte.
      await db.run('UPDATE users SET avatar_data = ?, avatar_mime = ?, avatar_path = ?, updated_at = ? WHERE id = ?', [
        buffer,
        mimeType,
        relPath,
        nowIso,
        req.user.id,
      ]);
    } else {
      saveImageToDisk({ buffer, ext, uploadDir: config.uploadDir, subdir: 'avatars', ownerId: req.user.id });
      await db.run(`UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?`, [relPath, nowIso, req.user.id]);
    }
    await audit(db, { tribeId: req.user.tribe_id, actorId: req.user.id, action: 'avatar_updated', targetType: 'user', targetId: req.user.id });
    sendJson(res, 200, { avatarPath: relPath });
  });

  router.get('/api/users/:id', requireActive, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target) throw notFound('Benutzer nicht gefunden');
    if (!req.user.roles.includes('developer') && target.tribe_id !== req.user.tribe_id) {
      throw notFound('Benutzer nicht gefunden');
    }
    sendJson(res, 200, { user: await serializeProfile(db, target, req.user) });
  });

  return router;
}

export { serializeProfile };
