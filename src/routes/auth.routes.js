import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, serializeCookie, clearCookie, badRequest } from '../lib/http.js';
import { requireString, requirePassword, requireEmail } from '../lib/validate.js';
import { register, login, logout, csrfTokenFor } from '../services/authService.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import { config } from '../config.js';

function publicUser(user) {
  return {
    id: user.id,
    tribeId: user.tribe_id,
    username: user.username,
    status: user.status,
    roles: user.roles,
    avatarPath: user.avatar_path,
  };
}

function setSessionCookie(res, sessionId, token, expiresAt) {
  const maxAge = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  res.setHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, `${sessionId}.${token}`, {
      maxAgeSeconds: maxAge,
      secure: config.isProduction,
      httpOnly: true,
      sameSite: 'Lax',
    })
  );
}

export function buildAuthRouter(db, { authRateLimit }) {
  const router = new Router();

  router.post('/api/auth/register', authRateLimit, async (req, res) => {
    const body = await readJsonBody(req);
    const tribeSlug = requireString(body.tribeSlug, 'tribeSlug', { max: 50 }).toLowerCase();
    const username = requireString(body.username, 'username', { min: 2, max: 40 });
    const email = body.email ? requireEmail(body.email) : null;
    const password = requirePassword(body.password);

    const user = await register(db, { tribeSlug, username, email, password });
    sendJson(res, 201, {
      user: publicUser(user),
      message: 'Registrierung erfolgreich. Ein Admin deines Tribes muss dein Konto noch freischalten.',
    });
  });

  router.post('/api/auth/login', authRateLimit, async (req, res) => {
    const body = await readJsonBody(req);
    const identifier = requireString(body.identifier, 'identifier', { max: 254 });
    if (typeof body.password !== 'string' || !body.password) throw badRequest('Passwort fehlt');

    const ip = req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || null;
    const result = await login(db, { identifier, password: body.password, ip, userAgent });

    setSessionCookie(res, result.sessionId, result.sessionToken, result.expiresAt);
    sendJson(res, 200, {
      user: publicUser(result.user),
      csrfToken: result.csrfToken,
    });
  });

  router.post('/api/auth/logout', requireAuth, async (req, res) => {
    await logout(db, req.session.id);
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE, { secure: config.isProduction }));
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', requireAuth, async (req, res) => {
    // Das CSRF-Token wird hier erneut ausgeliefert, damit die App nach einem
    // Seiten-Reload weiterarbeiten kann: Die Session steckt im HttpOnly-Cookie und
    // überlebt den Reload, das Token lag bisher nur im Speicher der Seite. Das ist
    // unbedenklich, weil ein fremdes Origin die Antwort dieses Requests wegen CORS
    // nicht auslesen kann - es braucht dafür eine gültige Session UND Lesezugriff.
    // Das Token ist pro Session stabil (siehe csrfTokenFor), zwei offene Tabs
    // sperren sich also nicht gegenseitig aus.
    sendJson(res, 200, {
      user: publicUser(req.user),
      csrfToken: req.session ? csrfTokenFor(req.session.id) : null,
    });
  });

  return router;
}

export { publicUser };
