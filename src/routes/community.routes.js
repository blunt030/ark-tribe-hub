import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, forbidden, notFound, tooMany } from '../lib/http.js';
import { requireString, parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf, requireRole } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

// No platform-wide override: these relationships and conversations belong to
// the signed-in user's own tribe, including users with the developer role.
function tribe(req) {
  if (!req.user.tribe_id) throw forbidden('Kein eigener Tribe vorhanden');
  return req.user.tribe_id;
}

function relationship(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest();
  if (!['alliance', 'friend', 'enemy'].includes(body.relationship)) throw badRequest('Ungültige Beziehung');
  return [requireString(body.name, 'name', { max: 100 }), body.relationship,
    requireString(body.server, 'server', { max: 100 }), requireString(body.map, 'map', { max: 100 })];
}

function positiveId(raw, name) {
  const n = parseIdParam(raw, name);
  if (!Number.isSafeInteger(n) || n < 1) throw badRequest('Ungültige ' + name);
  return n;
}

export function buildCommunityRouter(db) {
  const router = new Router();
  router.get('/api/alliances', requireActive, async (req, res) => {
    const alliances = await db.all('SELECT * FROM tribe_relationships WHERE tribe_id = ? ORDER BY name, id LIMIT 500', [tribe(req)]);
    sendJson(res, 200, { alliances });
  });
  router.post('/api/alliances', requireActive, requireCsrf, requireRole('admin'), async (req, res) => {
    const tribeId = tribe(req);
    const values = relationship(await readJsonBody(req));
    const alliance = await db.transaction(async tx => {
      const row = await tx.get('INSERT INTO tribe_relationships (tribe_id, name, relationship, server, map, created_by) VALUES (?,?,?,?,?,?) RETURNING *', [tribeId, ...values, req.user.id]);
      await audit(tx, { tribeId, actorId: req.user.id, action: 'alliance_created', targetType: 'alliance', targetId: row.id });
      return row;
    });
    sendJson(res, 201, { alliance });
  });
  router.patch('/api/alliances/:id', requireActive, requireCsrf, requireRole('admin'), async (req, res) => {
    const tribeId = tribe(req), id = parseIdParam(req.params.id);
    const values = relationship(await readJsonBody(req));
    const alliance = await db.transaction(async tx => {
      const row = await tx.get('UPDATE tribe_relationships SET name=?, relationship=?, server=?, map=?, updated_at=? WHERE id=? AND tribe_id=? RETURNING *', [...values, new Date().toISOString(), id, tribeId]);
      if (!row) throw notFound();
      await audit(tx, { tribeId, actorId: req.user.id, action: 'alliance_updated', targetType: 'alliance', targetId: id });
      return row;
    });
    sendJson(res, 200, { alliance });
  });
  router.delete('/api/alliances/:id', requireActive, requireCsrf, requireRole('admin'), async (req, res) => {
    const tribeId = tribe(req), id = parseIdParam(req.params.id);
    await db.transaction(async tx => {
      const row = await tx.get('DELETE FROM tribe_relationships WHERE id=? AND tribe_id=? RETURNING id', [id, tribeId]);
      if (!row) throw notFound();
      await audit(tx, { tribeId, actorId: req.user.id, action: 'alliance_deleted', targetType: 'alliance', targetId: id });
    });
    sendJson(res, 200, { ok: true });
  });
  router.get('/api/chat/messages', requireActive, async (req, res) => {
    const tribeId = tribe(req);
    const { before, after } = req.query;
    if (before && after) throw badRequest('Nur ein Cursor ist erlaubt');
    const limit = req.query.limit === undefined ? 50 : positiveId(req.query.limit, 'limit');
    if (limit > 100) throw badRequest('Maximal 100 Nachrichten');
    const cursor = before || after;
    const params = [tribeId];
    if (cursor) params.push(positiveId(cursor, 'cursor'));
    params.push(limit + 1);
    const rows = await db.all(`SELECT m.id, m.author_id, m.body, m.created_at, COALESCE(u.username, '—') AS author_name
      FROM tribe_messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.tribe_id = ? ${cursor ? `AND m.id ${after ? '>' : '<'} ?` : ''}
      ORDER BY m.id ${after ? 'ASC' : 'DESC'} LIMIT ?`, params);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit);
    if (!after) messages.reverse();
    sendJson(res, 200, { messages, hasMore });
  });
  router.post('/api/chat/messages', requireActive, requireCsrf, async (req, res) => {
    const tribeId = tribe(req);
    const body = requireString((await readJsonBody(req))?.body, 'body', { max: 2000 });
    const message = await db.transaction(async tx => {
      // A row lock serializes simultaneous posts by this author on Postgres;
      // SQLite's transaction queue provides the same guarantee locally.
      await tx.run('UPDATE users SET username = username WHERE id = ?', [req.user.id]);
      const since = new Date(Date.now() - 60_000).toISOString();
      const count = await tx.get('SELECT COUNT(*) AS n FROM tribe_messages WHERE tribe_id=? AND author_id=? AND created_at >= ?', [tribeId, req.user.id, since]);
      if (Number(count.n) >= 10) throw tooMany('Maximal 10 Nachrichten pro Minute');
      const row = await tx.get('INSERT INTO tribe_messages (tribe_id, author_id, body, created_at) VALUES (?,?,?,?) RETURNING id, author_id, body, created_at', [tribeId, req.user.id, body, new Date().toISOString()]);
      return { ...row, author_name: req.user.username };
    });
    sendJson(res, 201, { message });
  });
  return router;
}
