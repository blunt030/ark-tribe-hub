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
  // Zweiter Faktor (Authenticator-App); der Schluessel liegt verschluesselt vor.
  { table: 'users', column: 'totp_secret_encrypted', sql: 'ALTER TABLE users ADD COLUMN totp_secret_encrypted TEXT' },
  { table: 'users', column: 'totp_enabled', sql: 'ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0' },
  { table: 'users', column: 'totp_last_counter', sql: 'ALTER TABLE users ADD COLUMN totp_last_counter INTEGER' },
  // Zweiter Faktor per E-Mail als Alternative zur App ('totp' | 'email').
  { table: 'users', column: 'mfa_method', sql: 'ALTER TABLE users ADD COLUMN mfa_method TEXT' },
  { table: 'users', column: 'mfa_email_code_hash', sql: 'ALTER TABLE users ADD COLUMN mfa_email_code_hash TEXT' },
  { table: 'users', column: 'mfa_email_code_expires', sql: 'ALTER TABLE users ADD COLUMN mfa_email_code_expires TEXT' },
  // Discord-Webhooks je Tribe (verschluesselt), getrennt fuer Breeder und Crafter.
  { table: 'tribes', column: 'discord_breeder_webhook', sql: 'ALTER TABLE tribes ADD COLUMN discord_breeder_webhook TEXT' },
  { table: 'tribes', column: 'discord_crafter_webhook', sql: 'ALTER TABLE tribes ADD COLUMN discord_crafter_webhook TEXT' },
  // "Passwort vergessen": nur der Hash des Links wird gespeichert.
  { table: 'users', column: 'password_reset_token', sql: 'ALTER TABLE users ADD COLUMN password_reset_token TEXT' },
  { table: 'users', column: 'password_reset_expires', sql: 'ALTER TABLE users ADD COLUMN password_reset_expires TEXT' },
];

/**
 * Kontakt-E-Mail des Plattform-Developers "Blunt" (vom Betreiber vorgegeben),
 * damit "Passwort vergessen" fuer dieses Konto funktioniert. Laeuft genau
 * EINMAL: der Audit-Eintrag dient als Marker, spaetere Aenderungen im Profil
 * werden also nie wieder ueberschrieben. v2: korrigierte Adresse (v1 war falsch).
 */
export const DEVELOPER_CONTACT = { username: 'blunt', email: 'support.arkhub@gmail.com' };

export async function assignDeveloperContactEmail(db, contact = DEVELOPER_CONTACT) {
  const done = await db.get("SELECT id FROM audit_logs WHERE action = 'developer_contact_email_set_v2' LIMIT 1");
  if (done) return false;
  const dev = await db.get(
    `SELECT u.id, u.email FROM users u
     WHERE u.tribe_id IS NULL AND lower(u.username) = ?
       AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                   WHERE ur.user_id = u.id AND r.key = 'developer')`,
    [contact.username]
  );
  if (!dev) return false;
  const taken = await db.get('SELECT id FROM users WHERE lower(email) = ? AND id <> ?', [contact.email, dev.id]);
  if (taken) {
    console.error('[MIGRATION] Developer-E-Mail nicht gesetzt: Adresse gehoert bereits einem anderen Konto');
    return false;
  }
  await db.transaction(async (tx) => {
    await tx.run('UPDATE users SET email = ?, email_verified = 0, email_verify_token = NULL WHERE id = ?', [contact.email, dev.id]);
    await tx.run("INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES (?, 'developer_contact_email_set_v2', 'user', ?)", [dev.id, dev.id]);
  });
  console.log(`[MIGRATION] Developer-Konto ${dev.id}: Kontakt-E-Mail gesetzt`);
  return true;
}

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
  await assignDeveloperContactEmail(db);
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
