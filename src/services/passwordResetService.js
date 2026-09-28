import { hashPassword } from '../lib/password.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { badRequest } from '../lib/http.js';
import { config } from '../config.js';
import { audit } from './auditService.js';
import { sendPasswordResetEmail } from './mailService.js';

/**
 * "Passwort vergessen" per E-Mail-Link.
 *
 * Sicherheitsregeln:
 * - Die Antwort ist IMMER gleich, egal ob das Konto existiert (keine Konto-Aufzaehlung).
 * - In der Datenbank liegt nur der SHA-256 des Tokens; der Link selbst steht nur in der Mail.
 * - Link gilt 30 Minuten und genau einmal. Ein neuer Link ersetzt den alten.
 * - Nach dem Zuruecksetzen werden alle Sitzungen des Kontos beendet.
 * - Ein aktivierter zweiter Faktor bleibt bestehen und wird beim naechsten Login weiter verlangt.
 */
export const RESET_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export const resetTokenHash = (token) => `sha256:${sha256(token)}`;

async function findAccount(db, { identifier, tribeSlug }) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  const tribe = String(tribeSlug || '').trim().toLowerCase() || null;

  if (normalized.includes('@')) {
    return db.get('SELECT id, username, email, status, password_reset_expires FROM users WHERE lower(email) = ?', [normalized]);
  }
  if (tribe) {
    return db.get(
      `SELECT u.id, u.username, u.email, u.status, u.password_reset_expires FROM users u
       JOIN tribes t ON t.id = u.tribe_id
       WHERE lower(t.slug) = ? AND lower(u.username) = ? AND t.is_active = 1`,
      [tribe, normalized]
    );
  }
  // Gleiche Regel wie beim Login: ohne Tribe-Kuerzel nur Plattform-Developer.
  return db.get(
    `SELECT u.id, u.username, u.email, u.status, u.password_reset_expires FROM users u
     WHERE u.tribe_id IS NULL AND lower(u.username) = ?
       AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                   WHERE ur.user_id = u.id AND r.key = 'developer')`,
    [normalized]
  );
}

export async function requestPasswordReset(db, { identifier, tribeSlug }, { send = sendPasswordResetEmail, now = Date.now() } = {}) {
  const user = await findAccount(db, { identifier, tribeSlug });
  if (!user || !user.email || user.status === 'disabled' || user.status === 'rejected') {
    console.log('[PASSWORD-RESET] Anfrage ohne passendes Konto mit E-Mail - generische Antwort');
    return { ok: true };
  }

  // Schutz gegen Mail-Bombing: hoechstens ein Link pro Minute und Konto.
  const expires = Date.parse(user.password_reset_expires || '');
  if (Number.isFinite(expires) && expires - RESET_TTL_MS + RESEND_COOLDOWN_MS > now) {
    console.log(`[PASSWORD-RESET] Link fuer Konto ${user.id} wurde gerade erst verschickt - uebersprungen`);
    return { ok: true };
  }

  const token = randomToken(32);
  await db.run(
    'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
    [resetTokenHash(token), new Date(now + RESET_TTL_MS).toISOString(), user.id]
  );
  const resetUrl = `${config.publicUrl}/?reset=${token}`;
  try {
    const result = await Promise.race([
      send({ to: user.email, username: user.username, resetUrl }),
      new Promise((resolve) => setTimeout(() => resolve({ sent: false, reason: 'timeout_8s' }), 8000)),
    ]);
    console.log('[PASSWORD-RESET] Mail Ergebnis:', JSON.stringify(result));
  } catch (err) {
    console.error('[PASSWORD-RESET] Mailversand fehlgeschlagen:', err?.message || err);
  }
  return { ok: true };
}

export async function resetPassword(db, { token, password }, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw badRequest('Der Link ist ungültig oder abgelaufen', 'RESET_INVALID');
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw badRequest('Das Passwort muss mindestens 10 Zeichen lang sein');

  const digest = resetTokenHash(token);
  const user = await db.get('SELECT id, tribe_id, password_reset_expires FROM users WHERE password_reset_token = ?', [digest]);
  const expires = Date.parse(user?.password_reset_expires || '');
  if (!user || !Number.isFinite(expires) || expires < now) throw badRequest('Der Link ist ungültig oder abgelaufen', 'RESET_INVALID');

  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    // Compare-and-set: zwei gleichzeitige Einloesungen - nur eine gewinnt.
    const updated = await tx.get(
      `UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL,
         email_verified = 1
       WHERE id = ? AND password_reset_token = ? RETURNING id`,
      [hash, user.id, digest]
    );
    if (!updated) throw badRequest('Der Link ist ungültig oder abgelaufen', 'RESET_INVALID');
    await tx.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    await audit(tx, { tribeId: user.tribe_id, actorId: user.id, action: 'password_reset', targetType: 'user', targetId: user.id });
  });
  return { ok: true };
}
