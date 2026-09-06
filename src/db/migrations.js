/**
 * Migrationen für Spalten, die NACH dem ersten Live-Deploy hinzugekommen sind.
 * "CREATE TABLE IF NOT EXISTS" in schema.sql/schema.postgres.sql greift nur beim
 * allerersten Start (leere Datenbank) - auf einer bereits laufenden Datenbank
 * existiert die Tabelle schon und neue Spalten kommen dort NIE an, ohne ein
 * explizites ALTER TABLE. Jede Migration hier ist deshalb einzeln idempotent:
 * probiert das ALTER TABLE, ignoriert nur den einen erwarteten Fehler "Spalte
 * gibt es schon" (Formulierung unterscheidet sich zwischen SQLite und Postgres),
 * wirft aber alles andere weiter - ein echter Fehler soll nie still verschwinden.
 */
const MIGRATIONS = [
  { table: 'users', column: 'email_verified', sql: 'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0' },
  { table: 'users', column: 'email_verify_token', sql: 'ALTER TABLE users ADD COLUMN email_verify_token TEXT' },
  { table: 'users', column: 'email_verify_expires_at', sql: 'ALTER TABLE users ADD COLUMN email_verify_expires_at TEXT' },
];

function isAlreadyExistsError(err) {
  const msg = (err && err.message || '').toLowerCase();
  return msg.includes('duplicate column') || msg.includes('already exists');
}

export async function runMigrations(db) {
  for (const m of MIGRATIONS) {
    try {
      await db.run(m.sql);
      console.log(`[MIGRATION] ${m.table}.${m.column} hinzugefügt`);
    } catch (err) {
      if (isAlreadyExistsError(err)) continue; // bereits vorhanden - normal bei jedem Start nach dem ersten
      console.error(`[MIGRATION] Fehler bei ${m.table}.${m.column}:`, err.message);
      throw err;
    }
  }
}
