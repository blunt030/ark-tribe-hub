import { badRequest, notFound } from '../lib/http.js';
import { audit } from './auditService.js';

export const DINO_SEX = ['male', 'female', 'unknown'];
// Zuchtstatus statt Inventarstatus: Die Dino-Datenbank ist bewusst KEIN
// vollstaendiges Tierinventar, sondern ein Werkzeug fuer Zuchttiere und Top-Dinos.
// "verstorben/getauscht/verloren" waren Inventar-Denke und sind bewusst entfallen.
export const DINO_STATUS = ['active', 'breeding', 'paused', 'reserve'];

async function scopedDino(db, id, tribeId) {
  const row = await db.get('SELECT * FROM dinos WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Dino nicht gefunden');
  return row;
}

function parseStats(row) {
  if (!row) return row;
  let stats = null;
  if (row.stats) {
    try { stats = JSON.parse(row.stats); } catch { stats = null; }
  }
  return { ...row, stats };
}

export async function listDinos(db, tribeId, { search, species, status, ownerId } = {}) {
  let sql = `SELECT d.*, u.username AS owner_name FROM dinos d
             LEFT JOIN users u ON u.id = d.owner_id AND u.tribe_id = d.tribe_id
             WHERE d.tribe_id = ?`;
  const params = [tribeId];
  if (search) {
    sql += ' AND (d.name LIKE ? OR d.species LIKE ?)';
    const pattern = `%${search.replace(/[%_]/g, '\\$&')}%`;
    params.push(pattern, pattern);
  }
  if (species) { sql += ' AND d.species = ?'; params.push(species); }
  if (status) { sql += ' AND d.status = ?'; params.push(status); }
  if (ownerId) { sql += ' AND d.owner_id = ?'; params.push(ownerId); }
  sql += ' ORDER BY d.species, d.name LIMIT 1000';
  const rows = await db.all(sql, params);
  return rows.map(parseStats);
}

export async function getDino(db, id, tribeId) {
  const row = await scopedDino(db, id, tribeId);
  // JEDE verwandte Abfrage ebenfalls auf den Tribe eingrenzen. Ohne den Zusatz
  // koennte ueber eine (frueher gesetzte oder manipulierte) Elternreferenz Name
  // und Spezies eines fremden Tribe-Dinos ausgelesen werden - ein Cross-Tribe-Leck
  // ueber Umwege, obwohl der Dino selbst korrekt abgesichert ist.
  const [father, mother, children, owner] = await Promise.all([
    row.parent_male_id ? db.get('SELECT id, name, species FROM dinos WHERE id = ? AND tribe_id = ?', [row.parent_male_id, tribeId]) : null,
    row.parent_female_id ? db.get('SELECT id, name, species FROM dinos WHERE id = ? AND tribe_id = ?', [row.parent_female_id, tribeId]) : null,
    db.all('SELECT id, name, species FROM dinos WHERE tribe_id = ? AND (parent_male_id = ? OR parent_female_id = ?)', [tribeId, id, id]),
    row.owner_id ? db.get('SELECT id, username FROM users WHERE id = ? AND tribe_id = ?', [row.owner_id, tribeId]) : null,
  ]);
  return { ...parseStats(row), father, mother, children, ownerName: owner?.username || null };
}

function validateInput(body) {
  const name = body.name?.trim();
  const species = body.species?.trim();
  if (!name) throw badRequest('Name fehlt');
  if (!species) throw badRequest('Spezies fehlt');
  if (body.sex && !DINO_SEX.includes(body.sex)) throw badRequest('Ungültiges Geschlecht');
  if (body.status && !DINO_STATUS.includes(body.status)) throw badRequest('Ungültiger Status');
  return {
    name,
    species,
    sex: body.sex || 'unknown',
    level: body.level != null && body.level !== '' ? parseInt(body.level, 10) : null,
    ownerId: body.ownerId || null,
    server: body.server?.trim() || null,
    map: body.map?.trim() || null,
    location: body.location?.trim() || null,
    generation: body.generation != null && body.generation !== '' ? parseInt(body.generation, 10) : null,
    mutationsMale: body.mutationsMale != null ? parseInt(body.mutationsMale, 10) || 0 : 0,
    mutationsFemale: body.mutationsFemale != null ? parseInt(body.mutationsFemale, 10) || 0 : 0,
    parentMaleId: body.parentMaleId || null,
    parentFemaleId: body.parentFemaleId || null,
    status: body.status || 'active',
    stats: body.stats ? JSON.stringify(body.stats) : null,
    notes: body.notes?.trim() || null,
  };
}

/**
 * Stellt sicher, dass Besitzer und Elterntiere zum EIGENEN Tribe gehoeren.
 * Ohne diese Pruefung koennte ein Nutzer eine fremde Dino- oder Benutzer-ID
 * als Vater/Mutter/Besitzer eintragen - damit entstuende eine Cross-Tribe-
 * Referenz in der Datenbank, ueber die spaeter Daten sichtbar werden koennten.
 */
async function referenzenPruefen(db, tribeId, v, eigeneId = null) {
  if (v.ownerId) {
    const owner = await db.get(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND u.tribe_id = ? AND u.status = 'active' AND r.key = 'breeder_crafter'`,
      [v.ownerId, tribeId]
    );
    if (!owner) throw badRequest('Der ausgewählte Breeder gehört nicht als aktiver Breeder zu diesem Tribe');
  }
  for (const [feld, wert] of [['parentMaleId', v.parentMaleId], ['parentFemaleId', v.parentFemaleId]]) {
    if (!wert) continue;
    if (eigeneId && Number(wert) === Number(eigeneId)) throw badRequest('Ein Dino kann nicht sein eigenes Elterntier sein');
    const parent = await db.get('SELECT id FROM dinos WHERE id = ? AND tribe_id = ?', [wert, tribeId]);
    if (!parent) throw badRequest(`Referenziertes Elterntier (${feld}) gehört nicht zu diesem Tribe`);
  }
}

export async function createDino(db, tribeId, body, actorId) {
  const v = validateInput(body);
  return db.transaction(async (tx) => {
    await referenzenPruefen(tx, tribeId, v);
    const inserted = await tx.get(
      `INSERT INTO dinos (tribe_id, name, species, sex, level, owner_id, server, map, location, generation,
                          mutations_male, mutations_female, parent_male_id, parent_female_id, status, stats, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      [tribeId, v.name, v.species, v.sex, v.level, v.ownerId, v.server, v.map, v.location, v.generation,
       v.mutationsMale, v.mutationsFemale, v.parentMaleId, v.parentFemaleId, v.status, v.stats, v.notes, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'dino_created', targetType: 'dino', targetId: inserted.id, meta: { name: v.name, species: v.species } });
    return parseStats(inserted);
  });
}

export async function updateDino(db, id, tribeId, body, actorId) {
  const v = validateInput(body);
  const nowIso = new Date().toISOString();
  return db.transaction(async (tx) => {
    await scopedDino(tx, id, tribeId);
    await referenzenPruefen(tx, tribeId, v, id);
    await tx.run(
      `UPDATE dinos SET name=?, species=?, sex=?, level=?, owner_id=?, server=?, map=?, location=?, generation=?,
                        mutations_male=?, mutations_female=?, parent_male_id=?, parent_female_id=?, status=?, stats=?, notes=?, updated_at=?
       WHERE id = ?`,
      [v.name, v.species, v.sex, v.level, v.ownerId, v.server, v.map, v.location, v.generation,
       v.mutationsMale, v.mutationsFemale, v.parentMaleId, v.parentFemaleId, v.status, v.stats, v.notes, nowIso, id]
    );
    await audit(tx, { tribeId, actorId, action: 'dino_updated', targetType: 'dino', targetId: id });
    return parseStats(await tx.get('SELECT * FROM dinos WHERE id = ?', [id]));
  });
}

export async function deleteDino(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedDino(tx, id, tribeId);
    // Kinder nicht mitloeschen - nur die Elternreferenz kappen, damit ihre eigene
    // Historie (Generation, eigene Zucht) erhalten bleibt.
    await tx.run('UPDATE dinos SET parent_male_id = NULL WHERE parent_male_id = ?', [id]);
    await tx.run('UPDATE dinos SET parent_female_id = NULL WHERE parent_female_id = ?', [id]);
    await tx.run('DELETE FROM dinos WHERE id = ?', [id]);
    await audit(tx, { tribeId, actorId, action: 'dino_deleted', targetType: 'dino', targetId: id, meta: { name: row.name } });
  });
}
