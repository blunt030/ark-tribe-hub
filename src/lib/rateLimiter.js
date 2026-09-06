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

/**
 * Ermittelt die echte Client-IP - auch hinter einem Reverse-Proxy wie Render.
 *
 * Ohne diese Auswertung sieht die Anwendung nur die IP des Proxys. Dann teilen
 * sich ALLE Besucher dasselbe Limit, und ein Einzelner koennte mit vielen
 * Login-Versuchen absichtlich saemtliche Nutzer aussperren.
 *
 * Sicherheitsrelevant ist, WELCHEN Eintrag aus X-Forwarded-For man nimmt:
 * Der Header ist eine Liste, an die jeder Proxy hinten anhaengt. Ein Angreifer
 * kann einen eigenen Header mitschicken - dessen erfundene Werte stehen dann
 * LINKS. Der Proxy haengt die tatsaechliche Absender-IP rechts an. Deshalb wird
 * hier von RECHTS gezaehlt und genau so viele Eintraege uebersprungen, wie es
 * vertrauenswuerdige Proxys gibt (TRUSTED_PROXY_HOPS, bei Render = 1).
 * Blind den linken Wert zu nehmen waere eine Einladung zum Faelschen.
 *
 * Ist kein Proxy konfiguriert (lokal), wird der Header bewusst ignoriert.
 */
export function clientIp(req, trustedHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)) {
  const direkt = req.socket?.remoteAddress || 'unknown';
  if (!trustedHops) return direkt;

  const roh = req.headers?.['x-forwarded-for'];
  if (!roh) return direkt;

  const kette = String(roh).split(',').map((x) => x.trim()).filter(Boolean);
  if (!kette.length) return direkt;

  // Von rechts: der letzte Eintrag wurde vom naechsten Proxy gesetzt und ist
  // vertrauenswuerdig; bei mehreren Hops entsprechend weiter nach links.
  const index = kette.length - trustedHops;
  return kette[index] || kette[0] || direkt;
}
