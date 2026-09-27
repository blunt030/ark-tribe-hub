// Zweiter Faktor per E-Mail: 6-stelliger Einmalcode, 10 Minuten gueltig.
// Gespeichert wird nur ein HMAC des Codes, nie der Code selbst.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { hmac } from '../lib/tokens.js';
import { config } from '../config.js';
import { sendLoginCode } from './mailService.js';
import { badRequest, tooMany } from '../lib/http.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const digest = (userId, code) => hmac(config.sessionSecret, `mfa-mail:${userId}:${code}`);

/** Erzeugt einen neuen Code, speichert ihn gehasht und verschickt ihn. */
export async function issueEmailCode(db, user) {
  if (!user.email) throw badRequest('Für Codes per E-Mail muss im Profil eine E-Mail-Adresse hinterlegt sein');
  const row = await db.get('SELECT mfa_email_code_expires FROM users WHERE id = ?', [user.id]);
  const lastIssued = row?.mfa_email_code_expires ? Date.parse(row.mfa_email_code_expires) - CODE_TTL_MS : 0;
  if (Date.now() - lastIssued < RESEND_COOLDOWN_MS) throw tooMany('Bitte kurz warten, bevor ein neuer Code angefordert wird');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.run('UPDATE users SET mfa_email_code_hash = ?, mfa_email_code_expires = ? WHERE id = ?',
    [digest(user.id, code), new Date(Date.now() + CODE_TTL_MS).toISOString(), user.id]);
  const result = await sendLoginCode({ to: user.email, username: user.username, code });
  return { sent: Boolean(result?.sent) };
}

/** Prueft und verbraucht den Code (nur einmal gueltig). */
export async function consumeEmailCode(db, userId, code) {
  const normalized = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const row = await db.get('SELECT mfa_email_code_hash, mfa_email_code_expires FROM users WHERE id = ?', [userId]);
  if (!row?.mfa_email_code_hash || !row.mfa_email_code_expires || Date.parse(row.mfa_email_code_expires) < Date.now()) return false;
  const expected = Buffer.from(row.mfa_email_code_hash);
  const given = Buffer.from(digest(userId, normalized));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  await db.run('UPDATE users SET mfa_email_code_hash = NULL, mfa_email_code_expires = NULL WHERE id = ?', [userId]);
  return true;
}

/** Maskierte Adresse fuer den Hinweis "Code gesendet an b***@gmail.com". */
export function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 1)}***@${domain}`;
}
