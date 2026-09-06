import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, serializeCookie, clearCookie, badRequest } from '../lib/http.js';
import { requireString, requirePassword, requireEmail } from '../lib/validate.js';
import { register, login, logout, csrfTokenFor, verifyEmail } from '../services/authService.js';
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
    // Tribe-Name fuer die Kopfzeile (Punkt 19). Wird von der Session-Aufloesung
    // mitgeliefert; bleibt undefined, wenn kein Tribe vorhanden ist (Developer).
    tribeName: user.tribe_name || null,
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
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);

    const user = await register(db, { tribeSlug, username, email, password });
    sendJson(res, 201, {
      user: publicUser(user),
      message: 'Registrierung erfolgreich. Ein Admin deines Tribes muss dein Konto noch freischalten. Wir haben dir außerdem eine Mail zur Bestätigung deiner E-Mail-Adresse geschickt.',
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

  // Direkt aus dem Mail-Programm klickbar: liefert eine einfache, eigenständige
  // HTML-Seite statt JSON (kein SPA-Umweg nötig für diesen einen Klick).
  router.get('/api/auth/verify-email', async (req, res) => {
    const token = req.query.token;
    const result = await verifyEmail(db, token);
    const title = result.ok ? '✅ E-Mail bestätigt' : '❌ Link ungültig';
    const message = result.ok
      ? (result.alreadyVerified
          ? `Deine E-Mail-Adresse war bereits bestätigt, ${escapeHtml(result.username)}.`
          : `Danke, ${escapeHtml(result.username)} - deine E-Mail-Adresse ist jetzt bestätigt.`)
      : 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.';
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ARK Tribe Hub – E-Mail-Bestätigung</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0B0D10; color:#EDEFF2; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; box-sizing:border-box; }
  .box { max-width:420px; text-align:center; background:#14171B; border:1px solid #262B31; border-radius:14px; padding:32px 26px; }
  h1 { font-size:1.3rem; margin:0 0 12px; }
  p { color:#A7AEB8; line-height:1.5; }
  a { color:#D4AF37; }
</style></head><body>
<div class="box"><h1>${title}</h1><p>${message}</p><p><a href="/">Zurück zu ARK Tribe Hub</a></p></div>
</body></html>`;
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return router;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { publicUser };
