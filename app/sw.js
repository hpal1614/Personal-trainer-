/*
 * sw.js — Service worker for offline PWA support.
 * -----------------------------------------------
 * Caches the app shell so the app opens instantly and works with no internet —
 * exactly what you need in a gym basement with no signal. Your logged data is
 * separate (IndexedDB/localStorage in the page), so nothing here touches it.
 *
 * Strategy: cache-first for the app shell (fast, offline-proof); bump CACHE
 * whenever shell files change so old caches are cleaned up on activate.
 */

const CACHE = 'ptrainer-shell-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/coach.js',
  './js/store.js',
  './js/fitbit.js',
  './js/fitbit-config.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache the Fitbit API or other cross-origin API calls — always network.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Runtime-cache same-origin GETs so new files work offline next time.
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html')); // offline fallback
    })
  );
});
