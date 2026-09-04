import { sendError, notFound } from './http.js';

/**
 * Sehr kleiner Express-artiger Router. Bewusst selbst geschrieben, weil in dieser
 * Umgebung kein npm-Registry-Zugriff besteht – funktional entspricht das Verhalten
 * dem üblichen "app.get(path, mw1, mw2, handler)"-Muster und lässt sich 1:1 auf
 * Express portieren, falls später mit Internetzugriff entwickelt wird.
 */
export class Router {
  constructor() {
    this.routes = [];
  }

  _register(method, pattern, handlers) {
    const keys = [];
    const regexBody = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const regex = new RegExp(`^${regexBody}/?$`);
    this.routes.push({ method, regex, keys, handlers });
  }

  get(pattern, ...handlers) { this._register('GET', pattern, handlers); }
  post(pattern, ...handlers) { this._register('POST', pattern, handlers); }
  patch(pattern, ...handlers) { this._register('PATCH', pattern, handlers); }
  put(pattern, ...handlers) { this._register('PUT', pattern, handlers); }
  delete(pattern, ...handlers) { this._register('DELETE', pattern, handlers); }

  /** Registriert die Routen eines anderen Routers unter einem Präfix. */
  use(prefix, subRouter) {
    for (const route of subRouter.routes) {
      // Präfix + bestehende Regex-Quelle kombinieren.
      const combinedSource = route.regex.source.replace(/^\^/, `^${prefix}`);
      this.routes.push({ ...route, regex: new RegExp(combinedSource) });
    }
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    req.pathname = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams.entries());

    const candidates = this.routes.filter((r) => r.regex.test(req.pathname));
    const methodMatch = candidates.find((r) => r.method === req.method);

    if (!methodMatch) {
      if (candidates.length > 0) {
        sendError(res, notFound('Methode für diesen Pfad nicht unterstützt'));
      } else {
        sendError(res, notFound('Endpunkt nicht gefunden'));
      }
      return;
    }

    const match = req.pathname.match(methodMatch.regex);
    req.params = {};
    methodMatch.keys.forEach((key, i) => {
      req.params[key] = decodeURIComponent(match[i + 1]);
    });

    let index = 0;
    const next = async (err) => {
      if (err) {
        sendError(res, err);
        return;
      }
      const handler = methodMatch.handlers[index++];
      if (!handler) return;
      try {
        await handler(req, res, next);
      } catch (e) {
        sendError(res, e);
      }
    };
    await next();
  }
}
