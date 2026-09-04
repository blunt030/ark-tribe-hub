import { tooMany } from './http.js';

/**
 * Fixed-Window Rate Limiter pro Schlüssel (i.d.R. IP-Adresse), rein in-memory.
 * Reicht für eine einzelne Server-Instanz. Für einen Multi-Instanz-Betrieb später
 * durch einen gemeinsamen Store (z.B. Redis) ersetzen – die Middleware-Signatur
 * bliebe dabei identisch.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  // Alte Einträge periodisch aufräumen, damit die Map nicht unbegrenzt wächst.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  cleanupInterval.unref?.();

  return function rateLimit(key) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      throw tooMany();
    }
  };
}

export function clientIp(req) {
  // Kein Reverse-Proxy in dieser V1 vorgesehen; falls später hinter einem
  // vertrauenswürdigen Proxy betrieben, hier gezielt X-Forwarded-For auswerten.
  return req.socket?.remoteAddress || 'unknown';
}
