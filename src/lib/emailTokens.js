import { sha256 } from './tokens.js';

export const emailTokenHash = token => `sha256:${sha256(token)}`;

// Preserve already-mailed links while removing usable tokens from the database.
// Compare-and-set also permits concurrent app starts without double hashing.
export async function migrateEmailTokens(db) {
  const rows = await db.all("SELECT id, email_verify_token FROM users WHERE email_verify_token IS NOT NULL AND email_verify_token NOT LIKE 'sha256:%'");
  for (const row of rows) {
    await db.run('UPDATE users SET email_verify_token = ? WHERE id = ? AND email_verify_token = ?',
      [emailTokenHash(row.email_verify_token), row.id, row.email_verify_token]);
  }
}
