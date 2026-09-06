import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';

import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { seed } from './db/seed.js';
import { Router } from './lib/router.js';
import { sendError, sendJson, notFound } from './lib/http.js';
import { attachSession, requireActive } from './middleware/auth.js';
import { securityHeaders, cors, createRateLimiters } from './middleware/security.js';
import { isSafeUploadFilename } from './lib/imageUpload.js';

import { buildAuthRouter } from './routes/auth.routes.js';
import { buildUsersRouter } from './routes/users.routes.js';
import { buildTribesRouter } from './routes/tribes.routes.js';
import { buildCatalogRouter } from './routes/catalog.routes.js';
import { buildOrdersRouter } from './routes/orders.routes.js';
import { buildNotificationsRouter } from './routes/notifications.routes.js';
import { buildAdminRouter } from './routes/admin.routes.js';
import { buildDeveloperRouter } from './routes/developer.routes.js';
import { buildNewsRouter } from './routes/news.routes.js';
import { buildDinoRouter } from './routes/dinos.routes.js';
import { buildServerMapRouter } from './routes/servers.routes.js';
import { buildTaskRouter } from './routes/tasks.routes.js';
import { buildInventoryRouter } from './routes/inventory.routes.js';
import { buildVoiceRouter } from './routes/voice.routes.js';

const UPLOAD_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const PUBLIC_DIR = path.join(config.rootDir, 'public');

/**
 * Liefert das Frontend aus. Unbekannte Pfade, die nicht mit /api beginnen, geben
 * index.html zurück, damit der clientseitige Router auch bei direktem Aufruf einer
 * Unterseite (oder nach F5) funktioniert.
 *
 * Die Content-Security-Policy wird hier gelockert: Die globale Policy ist
 * "default-src 'none'" (richtig für eine reine API), das Frontend braucht aber
 * eigene Skripte, Styles, Bilder und die Google-Fonts-Schriften.
 */
function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.pathname.startsWith('/api/') || req.pathname.startsWith('/uploads/')) return false;

  // Path Traversal ausschließen: normalisierter Pfad muss innerhalb von public/ liegen.
  const requested = req.pathname === '/' ? '/index.html' : req.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  const isInside = filePath.startsWith(PUBLIC_DIR + path.sep) || filePath === PUBLIC_DIR;

  let finalPath = filePath;
  if (!isInside || !existsSync(filePath) || !statSync(filePath).isFile()) {
    finalPath = path.join(PUBLIC_DIR, 'index.html');
    if (!existsSync(finalPath)) return false;
  }

  const ext = path.extname(finalPath).toLowerCase();
  const data = readFileSync(finalPath);
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'"
  );
  res.writeHead(200, {
    'Content-Type': STATIC_MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    // Während der aktiven Test-/Weiterentwicklungsphase bewusst "no-cache" statt
    // langer Cache-Zeiten: erzwingt bei jedem Laden eine Rückfrage an den Server,
    // damit ein frischer Deploy sofort ankommt statt bis zu eine Stunde alten Code
    // aus dem Browser-Cache auszuliefern (genau das ist hier passiert).
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
  return true;
}

function buildUploadsRouter(db) {
  const router = new Router();
  router.get('/uploads/:subdir/:filename', requireActive, async (req, res) => {
    const { subdir, filename } = req.params;
    if (!['avatars', 'items', 'dinos', 'markers'].includes(subdir) || !isSafeUploadFilename(filename)) {
      throw notFound('Datei nicht gefunden');
    }
    const ext = path.extname(filename).slice(1).toLowerCase();
    const idPart = path.basename(filename, path.extname(filename));

    if (db.kind === 'postgres') {
      // Kein lokales Dateisystem verfügbar -> Bild kommt als Blob aus der DB.
      const table = subdir === 'avatars' ? 'users' : subdir === 'dinos' ? 'dinos' : subdir === 'markers' ? 'map_markers' : 'items';
      const dataCol = subdir === 'avatars' ? 'avatar_data' : 'image_data';
      const mimeCol = subdir === 'avatars' ? 'avatar_mime' : 'image_mime';
      if (!/^\d+$/.test(idPart)) throw notFound('Datei nicht gefunden');
      const row = await db.get(`SELECT ${dataCol} AS data, ${mimeCol} AS mime FROM ${table} WHERE id = ?`, [idPart]);
      if (!row || !row.data) throw notFound('Datei nicht gefunden');
      const buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      res.writeHead(200, {
        'Content-Type': row.mime || UPLOAD_MIME[ext] || 'application/octet-stream',
        'Content-Length': buffer.length,
        'Cache-Control': 'private, no-cache', // Dateiname ist jetzt pro Besitzer stabil (users/items-ID) -
      // ein neuer Upload ersetzt denselben Pfad, 'immutable' waere hier falsch.
      });
      res.end(buffer);
      return;
    }

    const filePath = path.join(config.uploadDir, subdir, filename);
    if (!existsSync(filePath)) throw notFound('Datei nicht gefunden');
    const data = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': UPLOAD_MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'private, no-cache', // Dateiname ist jetzt pro Besitzer stabil (users/items-ID) -
      // ein neuer Upload ersetzt denselben Pfad, 'immutable' waere hier falsch.
    });
    res.end(data);
  });
  return router;
}

/** Baut die App (DB + Router) auf, ohne bereits auf einen Port zu lauschen – ideal für Tests.
 *  dbPath wird nur verwendet, wenn KEIN DATABASE_URL gesetzt ist (SQLite-Pfad für Tests/lokal). */
export async function createApp(dbPath, options = {}) {
  const db = await openDatabase({ dbPath, databaseUrl: options.databaseUrl });
  // Bewusst IMMER seed() statt "nur wenn leer": seed() ist vollständig idempotent
  // (jede Zeile nutzt ON CONFLICT DO NOTHING), bestehende Daten (Bestellungen,
  // echte Mitglieder, Änderungen an Tribes) bleiben unangetastet. Der Vorteil:
  // wenn sich der Katalog (creatures.json/structures.json) ändert, zieht ein
  // normaler Redeploy die neuen Einträge automatisch nach, ohne dass irgendwer
  // manuell einen Seed-Befehl auf der laufenden Produktivdatenbank ausführen muss.
  await seed(db);

  const { globalRateLimit, authRateLimit } = createRateLimiters(options.rateLimits);

  const router = new Router();
  const subRouters = [
    buildAuthRouter(db, { authRateLimit }),
    buildUsersRouter(db),
    buildTribesRouter(db),
    buildCatalogRouter(db),
    buildOrdersRouter(db),
    buildNotificationsRouter(db),
    buildAdminRouter(db),
    buildDeveloperRouter(db),
    buildNewsRouter(db),
    buildDinoRouter(db),
    buildServerMapRouter(db),
    buildTaskRouter(db),
    buildInventoryRouter(db),
    buildVoiceRouter(db),
    buildUploadsRouter(db),
  ];
  for (const sub of subRouters) router.routes.push(...sub.routes);

  router.get('/api/health', async (req, res) => sendJson(res, 200, { status: 'ok' }));

  const globalMiddlewares = [securityHeaders, cors, globalRateLimit, attachSession(db)];

  const server = http.createServer((req, res) => {
    let idx = 0;
    const next = (err) => {
      if (err) {
        sendError(res, err);
        return;
      }
      if (res.writableEnded) return; // z.B. CORS-Preflight hat die Antwort bereits beendet
      const mw = globalMiddlewares[idx++];
      if (mw) {
        Promise.resolve()
          .then(() => mw(req, res, next))
          .catch((e) => sendError(res, e));
        return;
      }
      // Frontend zuerst: alles, was keine API-Route ist, kommt aus public/.
      const url = new URL(req.url, 'http://localhost');
      req.pathname = decodeURIComponent(url.pathname);
      try {
        if (serveStatic(req, res)) return;
      } catch (e) {
        sendError(res, e);
        return;
      }
      router.handle(req, res).catch((e) => sendError(res, e));
    };
    next();
  });

  return { server, db, router };
}

/** Startet den Server auf einem Port. port=0 => Betriebssystem vergibt einen freien Port (praktisch für Tests). */
export async function startServer(dbPath, port, options = {}) {
  const { server, db } = await createApp(dbPath, options);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({ server, db, port: actualPort });
    });
  });
}

// Direkter CLI-Aufruf: `npm run dev` / `npm start`
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(config.dbPath, config.port)
    .then(({ port }) => {
      console.log(`🦖 ARK Tribe Hub Backend läuft auf http://localhost:${port}`);
      console.log(`   Health-Check: http://localhost:${port}/api/health`);
      console.log(`   Datenbank: ${config.databaseUrl ? 'Postgres (DATABASE_URL)' : 'SQLite (' + config.dbPath + ')'}`);
    })
    .catch((err) => {
      console.error('❌ Start fehlgeschlagen:', err.message);
      process.exit(1);
    });
}
