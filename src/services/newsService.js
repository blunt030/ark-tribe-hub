import { badRequest, notFound } from '../lib/http.js';
import { audit } from './auditService.js';

export const NEWS_PRIORITIES = ['normal', 'high', 'urgent'];

/**
 * Nur News, die WIRKLICH gerade laufen sollen: aktiv geschaltet UND (falls gesetzt)
 * innerhalb von Start-/Endzeit. Reine Anwendungslogik statt komplexer SQL-Datumslogik,
 * damit sie in SQLite und Postgres identisch funktioniert.
 */
function isCurrentlyLive(row, nowIso) {
  if (!row.is_active) return false;
  if (row.starts_at && row.starts_at > nowIso) return false;
  if (row.ends_at && row.ends_at < nowIso) return false;
  return true;
}

export async function listActiveNews(db, tribeId) {
  const rows = await db.all('SELECT * FROM news WHERE tribe_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 50', [tribeId]);
  const nowIso = new Date().toISOString();
  return rows
    .filter((r) => isCurrentlyLive(r, nowIso))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'urgent' ? -1 : b.priority === 'urgent' ? 1 : a.priority === 'high' ? -1 : 1));
}

export async function listAllNews(db, tribeId) {
  return db.all('SELECT * FROM news WHERE tribe_id = ? ORDER BY created_at DESC LIMIT 200', [tribeId]);
}

export async function createNews(db, { tribeId, body, priority = 'normal', startsAt, endsAt, actorId }) {
  if (!body || !body.trim()) throw badRequest('Nachrichtentext fehlt');
  if (body.length > 280) throw badRequest('Nachricht ist zu lang (max. 280 Zeichen)');
  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      `INSERT INTO news (tribe_id, body, priority, starts_at, ends_at, created_by) VALUES (?,?,?,?,?,?) RETURNING *`,
      [tribeId, body.trim(), priority, startsAt || null, endsAt || null, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'news_created', targetType: 'news', targetId: inserted.id });
    return inserted;
  });
}

async function scopedNews(db, id, tribeId) {
  const row = await db.get('SELECT * FROM news WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('News-Eintrag nicht gefunden');
  return row;
}

export async function updateNews(db, id, tribeId, updates, actorId) {
  return db.transaction(async (tx) => {
    await scopedNews(tx, id, tribeId);
    const nowIso = new Date().toISOString();
    if (updates.body !== undefined) {
      if (!updates.body.trim()) throw badRequest('Nachrichtentext fehlt');
      if (updates.body.length > 280) throw badRequest('Nachricht ist zu lang (max. 280 Zeichen)');
      await tx.run('UPDATE news SET body = ? WHERE id = ?', [updates.body.trim(), id]);
    }
    if (updates.priority !== undefined) await tx.run('UPDATE news SET priority = ? WHERE id = ?', [updates.priority, id]);
    if (updates.isActive !== undefined) await tx.run('UPDATE news SET is_active = ? WHERE id = ?', [updates.isActive ? 1 : 0, id]);
    if (updates.startsAt !== undefined) await tx.run('UPDATE news SET starts_at = ? WHERE id = ?', [updates.startsAt || null, id]);
    if (updates.endsAt !== undefined) await tx.run('UPDATE news SET ends_at = ? WHERE id = ?', [updates.endsAt || null, id]);
    await tx.run('UPDATE news SET updated_at = ? WHERE id = ?', [nowIso, id]);
    await audit(tx, { tribeId, actorId, action: 'news_updated', targetType: 'news', targetId: id, meta: updates });
    return tx.get('SELECT * FROM news WHERE id = ?', [id]);
  });
}

export async function deleteNews(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    await scopedNews(tx, id, tribeId);
    await tx.run('DELETE FROM news WHERE id = ?', [id]);
    await audit(tx, { tribeId, actorId, action: 'news_deleted', targetType: 'news', targetId: id });
  });
}
