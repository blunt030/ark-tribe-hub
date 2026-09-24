import { emailTokenHash } from '../lib/emailTokens.js';
import { hashPassword, verifyPassword, needsPasswordRehash } from '../lib/password.js';
import { randomToken, sha256, hmac } from '../lib/tokens.js';
import { badRequest, unauthorized, conflict } from '../lib/http.js';
import { config } from '../config.js';
import { notify } from './notificationService.js';
import { audit } from './auditService.js';
import { notifyAdminOfRegistration, sendVerificationEmail } from './mailService.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 Minuten

export async function getUserRoles(db, userId) {
  const rows = await db.all(
    `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.key);
}

async function loadFullUser(db, userId) {
  // Tribe-Name gleich mitladen: die Kopfzeile zeigt ihn neben dem Logo an
  // (Punkt 19), sonst waere dafuer bei jedem Seitenaufruf eine Extra-Abfrage nötig.
  const user = await db.get(
    `SELECT u.*, t.name AS tribe_name, t.is_active AS tribe_active FROM users u
     LEFT JOIN tribes t ON t.id = u.tribe_id
     WHERE u.id = ?`,
    [userId]
  );
  if (!user) return null;
  return { ...user, roles: await getUserRoles(db, userId) };
}

export async function register(db, { tribeSlug, username, email, password }) {
  console.log(`[REGISTRATION] Anfrage erhalten: tribeSlug=${tribeSlug} username=${username}`);
  username = username?.trim();
  const tribe = await db.get('SELECT * FROM tribes WHERE slug = ? AND is_active = 1', [tribeSlug]);
  if (!tribe) throw badRequest('Unbekannter oder inaktiver Tribe', 'UNKNOWN_TRIBE');

  const existingByName = await db.get('SELECT id FROM users WHERE tribe_id = ? AND username = ?', [tribe.id, username]);
  if (existingByName) throw conflict('Dieser Benutzername ist in diesem Tribe bereits vergeben');

  if (email) {
    const existingByEmail = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingByEmail) throw conflict('Diese E-Mail-Adresse wird bereits verwendet');
  }

  const passwordHash = await hashPassword(password);
  const emailVerifyToken = email ? randomToken(24) : null;
  // Bestaetigungslinks laufen nach 24 Stunden ab. Ein unbegrenzt gueltiger Token
  // bleibt sonst dauerhaft in Postfaechern liegen und laesst sich spaeter noch
  // einloesen - etwa wenn jemand anders Zugriff auf das Postfach bekommt.
  const emailVerifyExpires = emailVerifyToken
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  const result = await db.transaction(async (tx) => {
    const insertResult = await tx.get(
      `INSERT INTO users (tribe_id, username, email, password_hash, status, email_verify_token, email_verify_expires_at) VALUES (?,?,?,?, 'pending_approval', ?, ?) RETURNING *`,
      [tribe.id, username, email || null, passwordHash, emailVerifyToken ? emailTokenHash(emailVerifyToken) : null, emailVerifyExpires]
    );
    const user = insertResult;

    await audit(tx, { tribeId: tribe.id, actorId: user.id, action: 'member_registered', targetType: 'user', targetId: user.id });

    const admins = await tx.all(
      `SELECT u.id, u.email FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.tribe_id = ? AND r.key = 'admin' AND u.status = 'active'`,
      [tribe.id]
    );
    for (const admin of admins) {
      await notify(tx, { userId: admin.id, tribeId: tribe.id, type: 'member_registered', payload: { username: user.username } });
    }

    return { ...user, roles: [], adminEmails: admins.map((a) => a.email).filter(Boolean) };
  });
  console.log(`[REGISTRATION] Benutzer gespeichert: id=${result.id} username=${result.username} status=${result.status}`);

  // Zwei getrennte Mails: eine an den Admin (Freischaltung nötig), eine an den
  // Nutzer selbst (E-Mail-Adresse bestätigen). Beide unabhängig voneinander mit
  // Zeitlimit - eine langsame/fehlschlagende Verbindung blockiert weder die
  // Registrierung noch die jeweils andere Mail.
  console.log(`[EMAIL] Benachrichtigung angefordert für Registrierung von "${result.username}"`);
  const withTimeout = (promise) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ sent: false, reason: 'timeout_8s' }), 8000))]);

  try {
    const adminMailResult = await withTimeout(
      notifyAdminOfRegistration({
        username: result.username,
        tribeName: tribe.name,
        email: result.email,
        // Zusätzlich zur festen Support-Adresse bekommen ALLE aktiven Admins des
        // betroffenen Tribes eine Mail - sie sind es ja, die freischalten müssen.
        extraRecipients: result.adminEmails || [],
      })
    );
    console.log('[EMAIL] Admin-Benachrichtigung Ergebnis:', JSON.stringify(adminMailResult));
  } catch (err) {
    console.error('[EMAIL] Unerwarteter Fehler bei Admin-Benachrichtigung:', err && err.stack ? err.stack : err);
  }

  if (email && emailVerifyToken) {
    try {
      const verifyUrl = `${config.publicUrl}/api/auth/verify-email?token=${emailVerifyToken}`;
      const verifyMailResult = await withTimeout(
        sendVerificationEmail({ to: email, username: result.username, verifyUrl })
      );
      console.log('[EMAIL] Bestätigungsmail Ergebnis:', JSON.stringify(verifyMailResult));
    } catch (err) {
      console.error('[EMAIL] Unerwarteter Fehler bei Bestätigungsmail:', err && err.stack ? err.stack : err);
    }
  }

  return result;
}

async function isLockedOut(db, identifier, ip) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const row = await db.get(
    `SELECT COUNT(*) AS failures FROM login_attempts
     WHERE identifier = ? AND ip = ? AND success = 0 AND created_at >= ?`,
    [identifier, ip, since]
  );
  return Number(row.failures) >= MAX_FAILED_ATTEMPTS;
}

export async function login(db, { tribeSlug, identifier, password, ip, userAgent }) {
  const normalized = identifier?.trim().toLowerCase();
  if (!normalized || typeof password !== 'string' || !password || password.length > 200) throw badRequest('Anmeldedaten fehlen');

  const normalizedTribe = tribeSlug?.trim().toLowerCase() || null;
  const attemptKey = normalized.includes('@') ? `email:${normalized}` : `${normalizedTribe || '-'}:${normalized}`;

  if (await isLockedOut(db, attemptKey, ip)) {
    throw unauthorized('Zu viele fehlgeschlagene Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
  }

  // Tribe-Name mitladen, damit die Kopfzeile ihn direkt nach dem Anmelden zeigt
  // (ohne JOIN kaeme hier null und der Name erschiene erst nach einem Neuladen).
  let user;
  if (normalized.includes('@')) {
    user = await db.get(
        `SELECT u.*, t.name AS tribe_name, t.is_active AS tribe_active FROM users u
         LEFT JOIN tribes t ON t.id = u.tribe_id
         WHERE lower(u.email) = ?`,
        [normalized]
      );
  } else if (normalizedTribe) {
    user = await db.get(
        `SELECT u.*, t.name AS tribe_name, t.is_active AS tribe_active FROM users u
         JOIN tribes t ON t.id = u.tribe_id
         WHERE lower(t.slug) = ? AND lower(u.username) = ? AND t.is_active = 1`,
        [normalizedTribe, normalized]
      );
  } else {
    // Plattform-Developer gehören absichtlich keinem Tribe an. Sie können sich
    // deshalb mit ihrem eindeutigen globalen Benutzernamen und leerem Tribe-Feld
    // anmelden. Normale Tribe-Namen bleiben ohne Kürzel uneindeutig und liefern
    // weiterhin nur die generische Fehlermeldung.
    user = await db.get(
      `SELECT u.*, NULL AS tribe_name FROM users u
       WHERE u.tribe_id IS NULL AND lower(u.username) = ?
         AND EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.key = 'developer'
         )`,
      [normalized]
    );
  }

  // Unknown accounts still perform the same expensive password derivation.
  const dummyHash = `scrypt-v2:${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const passwordMatches = await verifyPassword(password, user?.password_hash || dummyHash);
  const ok = Boolean(user) && passwordMatches;

  await db.run('INSERT INTO login_attempts (identifier, ip, success) VALUES (?,?,?)', [attemptKey, ip, ok ? 1 : 0]);

  if (!ok) {
    throw unauthorized('Benutzername/E-Mail oder Passwort ist falsch');
  }

  if (user.status === 'disabled' || user.status === 'rejected' || (user.tribe_id && !user.tribe_active)) {
    throw unauthorized('Dieses Konto ist gesperrt. Bitte wende dich an deinen Tribe-Admin.');
  }

  if (needsPasswordRehash(user.password_hash)) {
    const upgraded = await hashPassword(password);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?', [upgraded, user.id, user.password_hash]);
  }

  const sessionToken = randomToken(32);
  const sessionId = randomToken(16);
  const csrfToken = csrfTokenFor(sessionId);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();

  await db.run(
    `INSERT INTO sessions (id, token_hash, csrf_token_hash, user_id, user_agent, ip, expires_at)
     VALUES (?,?,?,?,?,?,?)`,
    [sessionId, sha256(sessionToken), sha256(csrfToken), user.id, userAgent || null, ip || null, expiresAt]
  );

  return {
    user: { ...user, roles: await getUserRoles(db, user.id) },
    sessionToken,
    csrfToken,
    sessionId,
    expiresAt,
  };
}

export async function logout(db, sessionId) {
  await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

/** Bestätigt eine E-Mail-Adresse anhand des Tokens aus der Bestätigungsmail. */
export async function verifyEmail(db, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return { ok: false, reason: 'invalid_token' };
  const digest = emailTokenHash(token);
  const user = await db.get(
    'SELECT id, username, email_verify_expires_at FROM users WHERE email_verify_token = ?', [digest]
  );
  if (!user) return { ok: false, reason: 'invalid_token' };
  if (user.email_verify_expires_at) {
    const expires = Date.parse(user.email_verify_expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) return { ok: false, reason: 'expired_token' };
  }
  // Only the token actually read may be consumed. A concurrent email change or
  // second click must never confirm another address using an obsolete link.
  const updated = await db.get(
    `UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires_at = NULL
     WHERE id = ? AND email_verify_token = ? RETURNING id`, [user.id, digest]
  );
  if (!updated) return { ok: false, reason: 'invalid_token' };
  return { ok: true, username: user.username, alreadyVerified: false };
}

/**
 * Das CSRF-Token wird deterministisch aus dem Server-Secret und der Session-ID
 * abgeleitet (HMAC-SHA256) statt zufaellig erzeugt zu werden - siehe Kommentar in
 * routes/auth.routes.js für die Begründung (stabil über Reloads/mehrere Tabs).
 */
export function csrfTokenFor(sessionId) {
  return hmac(config.sessionSecret, `csrf:${sessionId}`);
}

/** Prüft Cookie-Session-Token gegen die DB und liefert Session + vollständigen Benutzer zurück (oder null). */
export async function resolveSession(db, sessionId, rawToken) {
  if (!sessionId || !rawToken) return null;
  const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return null;
  if (session.token_hash !== sha256(rawToken)) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    return null;
  }
  // Sliding expiration: Session bei Aktivität verlängern (persistente Session).
  const newExpiry = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  await db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [nowIso, newExpiry, sessionId]);

  const user = await loadFullUser(db, session.user_id);
  if (!user || ['disabled', 'rejected'].includes(user.status) || (user.tribe_id && !user.tribe_active)) {
    await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    return null;
  }
  return { session, user };
}

export function checkCsrf(session, providedToken) {
  if (!providedToken) return false;
  return session.csrf_token_hash === sha256(providedToken);
}
