import { resolveSession, checkCsrf } from '../services/authService.js';
import { unauthorized, forbidden } from '../lib/http.js';
import { parseCookies } from '../lib/http.js';

export const SESSION_COOKIE = 'atb_session';

/** Liest die Session-Cookie (Format "sessionId.token") und hängt req.user/req.session an, falls gültig. */
export function attachSession(db) {
  return async (req, res, next) => {
    const cookies = parseCookies(req);
    const raw = cookies[SESSION_COOKIE];
    req.user = null;
    req.session = null;
    if (raw && raw.includes('.')) {
      const [sessionId, token] = raw.split('.');
      const resolved = await resolveSession(db, sessionId, token);
      if (resolved) {
        req.user = resolved.user;
        req.session = resolved.session;
      }
    }
    return next();
  };
}

/** Fordert nur eine gültige Session – auch pending/disabled Konten dürfen durch (z.B. GET /auth/me). */
export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

/** Fordert eine gültige Session UND ein freigeschaltetes Konto. Das ist die Standard-Prüfung für alle Tribe-Funktionen. */
export function requireActive(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.status !== 'active') {
    return next(forbidden('Dein Konto wartet noch auf Freischaltung durch einen Admin.'));
  }
  return next();
}

/** Fordert mindestens eine der angegebenen Rollen. Die Rolle "developer" hat plattformweiten Zugriff und besteht immer. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.status !== 'active') return next(forbidden('Dein Konto wartet noch auf Freischaltung durch einen Admin.'));
    const ok = req.user.roles.includes('developer') || roles.some((r) => req.user.roles.includes(r));
    if (!ok) return next(forbidden());
    return next();
  };
}

/**
 * CSRF-Schutz nach dem Synchronizer-Token-Muster: das Token wird beim Login NUR im
 * JSON-Body zurückgegeben (nicht als Cookie), das Frontend muss es aktiv auslesen und
 * bei verändernden Requests als Header mitschicken. Ein fremdes Cross-Site-Formular
 * kann diesen Header nicht setzen, selbst wenn der Browser die Session-Cookie automatisch
 * mitschickt – deshalb reicht ein gültiges Cookie allein für POST/PUT/PATCH/DELETE nicht.
 */
export function requireCsrf(req, res, next) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!mutating) return next();
  if (!req.session) return next(unauthorized());
  const token = req.headers['x-csrf-token'];
  if (!checkCsrf(req.session, token)) {
    return next(forbidden('Ungültiges oder fehlendes CSRF-Token (Header X-CSRF-Token erforderlich)'));
  }
  return next();
}
