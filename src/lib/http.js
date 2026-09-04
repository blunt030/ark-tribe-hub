export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg = 'Ungültige Anfrage', code = 'BAD_REQUEST') => new ApiError(400, code, msg);
export const unauthorized = (msg = 'Nicht angemeldet') => new ApiError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'Keine Berechtigung für diese Aktion') => new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Nicht gefunden') => new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg = 'Konflikt') => new ApiError(409, 'CONFLICT', msg);
export const tooMany = (msg = 'Zu viele Anfragen, bitte später erneut versuchen') => new ApiError(429, 'RATE_LIMITED', msg);

const MAX_BODY_BYTES = 2_000_000; // 2 MB (reicht für JSON inkl. Base64-Avatarbilder in Item-Größe)

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(badRequest('Anfrage zu groß', 'PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(badRequest('Ungültiges JSON im Request-Body'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  if (!res.headersSent) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
  }
  res.end(payload);
}

export function sendError(res, err) {
  if (err instanceof ApiError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  // Unerwarteter Fehler: Details nur serverseitig loggen, dem Client keine internen
  // Informationen (Stacktrace, DB-Fehlermeldungen) preisgeben.
  console.error('Unerwarteter Fehler:', err);
  sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Interner Serverfehler' } });
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name, value, { maxAgeSeconds, secure, httpOnly = true, sameSite = 'Lax', path: cookiePath = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (typeof maxAgeSeconds === 'number') parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

export function clearCookie(name, { secure } = {}) {
  return serializeCookie(name, '', { maxAgeSeconds: 0, secure });
}
