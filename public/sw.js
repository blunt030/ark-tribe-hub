// Service Worker: cacht nur die App-Hülle (Code, Styles, Bilder), damit die App
// auch bei schlechter Verbindung startet.
//
// Bewusst NICHT gecacht: alles unter /api und /uploads. Tribe-Daten sind
// vertraulich und veralten schnell - sie kommen immer frisch vom Server, damit
// niemand nach einer Abmeldung noch alte Bestellungen aus dem Cache sieht.

const CACHE = 'ath-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/i18n.js',
  '/js/ui.js',
  '/js/views/auth.js',
  '/js/views/dashboard.js',
  '/js/views/orders.js',
  '/js/views/misc.js',
  '/assets/logo.png',
  '/assets/icon-192.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Network-first: immer die aktuelle Version, Cache nur als Rückfallebene.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/index.html')))
  );
});
