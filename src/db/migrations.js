import { migrateEmailTokens } from '../lib/emailTokens.js';
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
  { table: 'users', column: 'personal_pin_encrypted', sql: 'ALTER TABLE users ADD COLUMN personal_pin_encrypted TEXT' },
  { table: 'game_servers', column: 'map_image_path', sql: 'ALTER TABLE game_servers ADD COLUMN map_image_path TEXT' },
  {
    table: 'game_servers',
    column: 'map_image_data',
    sqliteSql: 'ALTER TABLE game_servers ADD COLUMN map_image_data BLOB',
    postgresSql: 'ALTER TABLE game_servers ADD COLUMN map_image_data BYTEA',
  },
  { table: 'game_servers', column: 'map_image_mime', sql: 'ALTER TABLE game_servers ADD COLUMN map_image_mime TEXT' },
  // Bei bestehenden Datenbanken bewusst nullable ergänzen: SQLite erlaubt beim
  // ALTER TABLE keinen berechneten Zeit-Default. Neue/aktive Teilnehmer setzen
  // den Wert in voiceService sofort; alte Geistereinträge werden entfernt.
  { table: 'voice_participants', column: 'last_seen_at', sql: 'ALTER TABLE voice_participants ADD COLUMN last_seen_at TEXT' },
];

function isAlreadyExistsError(err) {
  const msg = (err && err.message || '').toLowerCase();
  return msg.includes('duplicate column') || msg.includes('already exists');
}

export async function runMigrations(db) {
  for (const m of MIGRATIONS) {
    try {
      const sql = db.kind === 'postgres' ? (m.postgresSql || m.sql) : (m.sqliteSql || m.sql);
      await db.run(sql);
      console.log(`[MIGRATION] ${m.table}.${m.column} hinzugefügt`);
    } catch (err) {
      if (isAlreadyExistsError(err)) continue; // bereits vorhanden - normal bei jedem Start nach dem ersten
      console.error(`[MIGRATION] Fehler bei ${m.table}.${m.column}:`, err.message);
      throw err;
    }
  }
  await migrateEmailTokens(db);
  await migrateVaults(db);
  await splitBreederCrafter(db);
}

/**
 * Die kombinierte Rolle breeder_crafter wird in die getrennten Rollen breeder
 * und crafter aufgeteilt (beide vergeben, damit niemand Rechte verliert).
 * Admins nehmen danach die jeweils nicht passende Rolle weg. Idempotent.
 */
async function splitBreederCrafter(db) {
  const ids = {};
  for (const key of ['breeder_crafter', 'breeder', 'crafter']) {
    await db.run('INSERT INTO roles (key) VALUES (?) ON CONFLICT(key) DO NOTHING', [key]);
    ids[key] = (await db.get('SELECT id FROM roles WHERE key = ?', [key])).id;
  }
  const holders = await db.all('SELECT user_id FROM user_roles WHERE role_id = ?', [ids.breeder_crafter]);
  for (const { user_id: userId } of holders) {
    await db.transaction(async (tx) => {
      for (const key of ['breeder', 'crafter']) {
        await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (?,?) ON CONFLICT(user_id, role_id) DO NOTHING', [userId, ids[key]]);
      }
      await tx.run('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [userId, ids.breeder_crafter]);
    });
  }
  if (holders.length) console.log(`[MIGRATION] ${holders.length} Konto/Konten: Breeder/Crafter in getrennte Rollen aufgeteilt`);
}

/**
 * Bisher stand die Vault-Nummer als Freitext am Benutzer. Einmalig (idempotent)
 * in die Vault-Liste uebernehmen, damit Admins sie dort verwalten koennen.
 */
async function migrateVaults(db) {
  const rows = await db.all(
    `SELECT u.id, u.tribe_id, u.personal_vault_number FROM users u
     WHERE u.tribe_id IS NOT NULL AND u.personal_vault_number IS NOT NULL AND u.personal_vault_number <> ''`
  );
  for (const u of rows) {
    const name = String(u.personal_vault_number).trim().slice(0, 50);
    const existing = await db.get('SELECT id FROM tribe_vaults WHERE tribe_id = ? AND name = ?', [u.tribe_id, name]);
    if (existing) continue;
    await db.run('INSERT INTO tribe_vaults (tribe_id, name, assigned_user_id) VALUES (?,?,?)', [u.tribe_id, name, u.id]);
    console.log(`[MIGRATION] Vault ${name} aus Benutzerprofil uebernommen`);
  }
}
