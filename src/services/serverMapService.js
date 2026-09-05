import { badRequest, notFound } from '../lib/http.js';
import { audit } from './auditService.js';

export const MARKER_CATEGORIES = ['base', 'turret_base', 'warroom', 'farm', 'resource', 'dino', 'loot', 'cave', 'boss', 'other'];

async function scopedServer(db, id, tribeId) {
  const row = await db.get('SELECT * FROM game_servers WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Server nicht gefunden');
  return row;
}

export async function listServers(db, tribeId) {
  return db.all('SELECT * FROM game_servers WHERE tribe_id = ? ORDER BY name', [tribeId]);
}

export async function getServer(db, id, tribeId) {
  const server = await scopedServer(db, id, tribeId);
  const markers = await db.all('SELECT * FROM map_markers WHERE server_id = ? ORDER BY name', [id]);
  return { ...server, markers };
}

export async function createServer(db, tribeId, body, actorId) {
  const name = body.name?.trim();
  const mapName = body.mapName?.trim();
  if (!name) throw badRequest('Servername fehlt');
  if (!mapName) throw badRequest('Map fehlt');
  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      'INSERT INTO game_servers (tribe_id, name, map_name, status, notes, created_by) VALUES (?,?,?,?,?,?) RETURNING *',
      [tribeId, name, mapName, body.status || 'active', body.notes?.trim() || null, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'server_created', targetType: 'server', targetId: inserted.id, meta: { name } });
    return inserted;
  });
}

export async function updateServer(db, id, tribeId, body, actorId) {
  const name = body.name?.trim();
  const mapName = body.mapName?.trim();
  if (!name) throw badRequest('Servername fehlt');
  if (!mapName) throw badRequest('Map fehlt');
  const nowIso = new Date().toISOString();
  return db.transaction(async (tx) => {
    await scopedServer(tx, id, tribeId);
    await tx.run(
      'UPDATE game_servers SET name=?, map_name=?, status=?, notes=?, updated_at=? WHERE id = ?',
      [name, mapName, body.status || 'active', body.notes?.trim() || null, nowIso, id]
    );
    await audit(tx, { tribeId, actorId, action: 'server_updated', targetType: 'server', targetId: id });
    return tx.get('SELECT * FROM game_servers WHERE id = ?', [id]);
  });
}

export async function deleteServer(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedServer(tx, id, tribeId);
    await tx.run('DELETE FROM game_servers WHERE id = ?', [id]); // Marker fallen per ON DELETE CASCADE mit weg
    await audit(tx, { tribeId, actorId, action: 'server_deleted', targetType: 'server', targetId: id, meta: { name: row.name } });
  });
}

function validateMarker(body) {
  const name = body.name?.trim();
  if (!name) throw badRequest('Name fehlt');
  const category = body.category && MARKER_CATEGORIES.includes(body.category) ? body.category : 'other';
  return {
    name,
    category,
    coordX: body.coordX != null && body.coordX !== '' ? parseFloat(body.coordX) : null,
    coordY: body.coordY != null && body.coordY !== '' ? parseFloat(body.coordY) : null,
    description: body.description?.trim() || null,
  };
}

export async function createMarker(db, serverId, tribeId, body, actorId) {
  await scopedServer(db, serverId, tribeId);
  const v = validateMarker(body);
  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      'INSERT INTO map_markers (server_id, tribe_id, name, category, coord_x, coord_y, description, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING *',
      [serverId, tribeId, v.name, v.category, v.coordX, v.coordY, v.description, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'marker_created', targetType: 'marker', targetId: inserted.id, meta: { name: v.name } });
    return inserted;
  });
}

async function scopedMarker(db, id, tribeId) {
  const row = await db.get('SELECT * FROM map_markers WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Markierung nicht gefunden');
  return row;
}

export async function updateMarker(db, id, tribeId, body, actorId) {
  const v = validateMarker(body);
  const nowIso = new Date().toISOString();
  return db.transaction(async (tx) => {
    await scopedMarker(tx, id, tribeId);
    await tx.run(
      'UPDATE map_markers SET name=?, category=?, coord_x=?, coord_y=?, description=?, updated_at=? WHERE id = ?',
      [v.name, v.category, v.coordX, v.coordY, v.description, nowIso, id]
    );
    await audit(tx, { tribeId, actorId, action: 'marker_updated', targetType: 'marker', targetId: id });
    return tx.get('SELECT * FROM map_markers WHERE id = ?', [id]);
  });
}

export async function deleteMarker(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedMarker(tx, id, tribeId);
    await tx.run('DELETE FROM map_markers WHERE id = ?', [id]);
    await audit(tx, { tribeId, actorId, action: 'marker_deleted', targetType: 'marker', targetId: id, meta: { name: row.name } });
  });
}
