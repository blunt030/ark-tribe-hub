import { badRequest, notFound, conflict } from '../lib/http.js';
import { audit } from './auditService.js';

/** Status wird bewusst NICHT gespeichert, sondern immer aus quantity/min_quantity
 *  abgeleitet - so kann es nie aus dem Ruder laufen (kein Sync-Problem möglich). */
function withStatus(row) {
  return { ...row, status: row.quantity >= row.min_quantity ? 'ok' : 'refill_needed' };
}

async function scopedEntry(db, id, tribeId) {
  const row = await db.get('SELECT * FROM inventory WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Bestandseintrag nicht gefunden');
  return row;
}

export async function listInventory(db, tribeId, { location, onlyLow } = {}) {
  let sql = `SELECT inv.*, i.key AS item_key, i.emoji, i.image_path, i.product_type,
                    COALESCE(t.name, t_de.name, i.key) AS item_name
             FROM inventory inv
             JOIN items i ON i.id = inv.item_id
             LEFT JOIN item_translations t ON t.item_id = i.id AND t.lang = 'de'
             LEFT JOIN item_translations t_de ON t_de.item_id = i.id AND t_de.lang = 'de'
             WHERE inv.tribe_id = ?`;
  const params = [tribeId];
  if (location) { sql += ' AND inv.location = ?'; params.push(location); }
  sql += ' ORDER BY inv.location, item_name LIMIT 1000';
  const rows = await db.all(sql, params);
  const withStat = rows.map(withStatus);
  return onlyLow ? withStat.filter((r) => r.status === 'refill_needed') : withStat;
}

export async function listLocations(db, tribeId) {
  const rows = await db.all('SELECT DISTINCT location FROM inventory WHERE tribe_id = ? ORDER BY location', [tribeId]);
  return rows.map((r) => r.location);
}

function validateInput(body) {
  const location = body.location?.trim();
  if (!location) throw badRequest('Standort fehlt');
  if (!body.itemId) throw badRequest('Item fehlt');
  const quantity = parseInt(body.quantity, 10);
  const minQuantity = parseInt(body.minQuantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) throw badRequest('Bestand muss eine positive Zahl sein');
  if (Number.isNaN(minQuantity) || minQuantity < 0) throw badRequest('Mindestbestand muss eine positive Zahl sein');
  return { location, itemId: body.itemId, quantity, minQuantity, notes: body.notes?.trim() || null };
}

export async function createEntry(db, tribeId, body, actorId) {
  const v = validateInput(body);
  const item = await db.get('SELECT id FROM items WHERE id = ?', [v.itemId]);
  if (!item) throw badRequest('Unbekanntes Item');

  const existing = await db.get('SELECT id FROM inventory WHERE tribe_id = ? AND item_id = ? AND location = ?', [tribeId, v.itemId, v.location]);
  if (existing) throw conflict('Für dieses Item gibt es an diesem Standort schon einen Bestandseintrag - bitte den bestehenden bearbeiten.');

  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      'INSERT INTO inventory (tribe_id, item_id, location, quantity, min_quantity, notes, created_by) VALUES (?,?,?,?,?,?,?) RETURNING *',
      [tribeId, v.itemId, v.location, v.quantity, v.minQuantity, v.notes, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'inventory_created', targetType: 'inventory', targetId: inserted.id, meta: { location: v.location } });
    return withStatus(inserted);
  });
}

export async function updateEntry(db, id, tribeId, body, actorId) {
  const v = validateInput(body);
  const nowIso = new Date().toISOString();
  return db.transaction(async (tx) => {
    await scopedEntry(tx, id, tribeId);
    await tx.run(
      'UPDATE inventory SET item_id=?, location=?, quantity=?, min_quantity=?, notes=?, updated_at=? WHERE id = ?',
      [v.itemId, v.location, v.quantity, v.minQuantity, v.notes, nowIso, id]
    );
    await audit(tx, { tribeId, actorId, action: 'inventory_updated', targetType: 'inventory', targetId: id });
    return withStatus(await tx.get('SELECT * FROM inventory WHERE id = ?', [id]));
  });
}

/** Schneller Weg für "+1/-1"-Knöpfe, ohne das ganze Formular zu öffnen. */
export async function adjustQuantity(db, id, tribeId, delta, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedEntry(tx, id, tribeId);
    const newQty = Math.max(0, row.quantity + delta);
    await tx.run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?', [newQty, new Date().toISOString(), id]);
    await audit(tx, { tribeId, actorId, action: 'inventory_adjusted', targetType: 'inventory', targetId: id, meta: { delta, newQty } });
    return withStatus(await tx.get('SELECT * FROM inventory WHERE id = ?', [id]));
  });
}

export async function deleteEntry(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedEntry(tx, id, tribeId);
    await tx.run('DELETE FROM inventory WHERE id = ?', [id]);
    await audit(tx, { tribeId, actorId, action: 'inventory_deleted', targetType: 'inventory', targetId: id, meta: { location: row.location } });
  });
}
