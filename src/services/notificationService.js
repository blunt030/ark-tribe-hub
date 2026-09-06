/**
 * Erstellt eine Benachrichtigung – aber NUR, wenn der Empfänger diesen Typ nicht
 * explizit deaktiviert hat. Fehlt eine Präferenz-Zeile, gilt der Typ als aktiviert
 * (Standard: an). So ist jede Benachrichtigungsart einzeln konfigurierbar, nicht nur
 * global an/aus.
 */
export async function notify(db, { userId, tribeId, type, payload }) {
  // Zweite Verteidigungslinie: der Empfaenger MUSS zum angegebenen Tribe gehoeren.
  // Die aufrufenden Services pruefen das bereits, aber ein Fehler dort wuerde
  // sonst still eine tribefremde Benachrichtigung erzeugen. Lieber hier hart
  // abbrechen als eine falsche Zustellung.
  if (tribeId) {
    const empfaenger = await db.get('SELECT id FROM users WHERE id = ? AND tribe_id = ?', [userId, tribeId]);
    if (!empfaenger) {
      console.error(`[NOTIFY] Abgebrochen: Empfänger ${userId} gehört nicht zu Tribe ${tribeId} (Typ: ${type})`);
      return null;
    }
  }

  const pref = await db.get('SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?', [userId, type]);
  if (pref && Number(pref.enabled) === 0) return null;

  return db.get('INSERT INTO notifications (user_id, tribe_id, type, payload) VALUES (?,?,?,?) RETURNING *', [
    userId,
    tribeId,
    type,
    payload ? JSON.stringify(payload) : null,
  ]);
}

export async function listForUser(db, userId, { unreadOnly = false, limit = 50 } = {}) {
  const rows = await db.all(
    `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
     ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
}

export async function markRead(db, userId, notificationId) {
  return db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notificationId, userId]);
}

export async function markAllRead(db, userId) {
  return db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
}

export async function getPreferences(db, userId) {
  const types = await db.all('SELECT key FROM notification_types ORDER BY key');
  const existingRows = await db.all('SELECT type, enabled FROM notification_preferences WHERE user_id = ?', [userId]);
  const existing = new Map(existingRows.map((r) => [r.type, r.enabled]));
  return types.map((t) => ({ type: t.key, enabled: existing.has(t.key) ? Number(existing.get(t.key)) !== 0 : true }));
}

export async function setPreferences(db, userId, updates) {
  // updates: [{ type, enabled }, ...]
  return db.transaction(async (tx) => {
    for (const { type, enabled } of updates) {
      const exists = await tx.get('SELECT key FROM notification_types WHERE key = ?', [type]);
      if (!exists) continue; // unbekannte Typen werden ignoriert statt einen Fehler zu werfen
      await tx.run(
        `INSERT INTO notification_preferences (user_id, type, enabled) VALUES (?,?,?)
         ON CONFLICT(user_id, type) DO UPDATE SET enabled = excluded.enabled`,
        [userId, type, enabled ? 1 : 0]
      );
    }
    return getPreferences(tx, userId);
  });
}

/**
 * Loescht eine einzelne Benachrichtigung. Der Filter auf user_id ist die
 * eigentliche Berechtigungspruefung: niemand kann fremde Meldungen entfernen,
 * auch nicht mit geratener ID.
 */
export async function remove(db, notificationId, userId) {
  const res = await db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId]);
  return res.changes > 0;
}

/** Entfernt alle bereits gelesenen Meldungen - zum Aufraeumen des Posteingangs. */
export async function removeAllRead(db, userId) {
  const res = await db.run('DELETE FROM notifications WHERE user_id = ? AND is_read = 1', [userId]);
  return res.changes || 0;
}
