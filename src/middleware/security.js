import { config } from '../config.js';
import { createRateLimiter, clientIp } from '../lib/rateLimiter.js';

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return next();
}

/** Einfaches CORS fuer ein spaeteres separates Frontend. Ohne Konfiguration werden im
 *  Development-Modus nur localhost-Origins erlaubt; in Produktion muss CORS_ORIGINS
 *  gesetzt sein. */
export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed =
      config.corsOrigins.length > 0
        ? config.corsOrigins.includes(origin)
        : !config.isProduction && /^https?:\/\/localhost(:\d+)?$/.test(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  return next();
}

/**
 * Erzeugt die Rate-Limiter fuer eine App-Instanz.
 *
 * Die Grenzwerte sind bewusst konfigurierbar statt fest verdrahtet: In Produktion
 * schuetzen die Standardwerte (120 Requests/Min. allgemein, 10/Min. auf Login und
 * Registrierung) vor automatisierten Angriffen. Die automatisierte Testsuite und
 * spaetere Lasttests wuerden mit diesen Werten dagegen sofort selbst ausgesperrt,
 * weil dort alle Requests von 127.0.0.1 kommen - deshalb kann der Wert pro
 * App-Instanz hochgesetzt werden, ohne den Schutzmechanismus zu entfernen.
 *
 * Wichtig: Der Brute-Force-Schutz beim Login ist davon unabhaengig und greift
 * IMMER (pro Benutzername + IP, siehe authService.isLockedOut).
 */
export function createRateLimiters({
  windowMs = 60_000,
  globalMax = config.rateLimitGlobalMax,
  authMax = config.rateLimitAuthMax,
} = {}) {
  const globalLimiter = createRateLimiter({ windowMs, max: globalMax });
  const authLimiter = createRateLimiter({ windowMs, max: authMax });

  return {
    globalRateLimit(req, res, next) {
      try {
        globalLimiter(clientIp(req));
      } catch (err) {
        return next(err);
      }
      return next();
    },
    authRateLimit(req, res, next) {
      try {
        authLimiter(clientIp(req));
      } catch (err) {
        return next(err);
      }
      return next();
    },
  };
}
