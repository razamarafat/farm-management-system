// =====================================================================
// public/sw.js — Morvarid Farm PWA Offline Service Worker
//
// Implements App Shell offline caching and navigation fallback.
// Intercepts `mode: 'navigate'` requests so that refreshing or opening
// any route (e.g. /operator/consumption/feed) while disconnected serves
// the cached single-file bundle instead of Chrome's offline dinosaur screen.
// =====================================================================

const CACHE_VERSION = 'morvarid-shell-v1';

// Critical app shell assets to precache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './logo.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// Install: precache the application shell with resilient allSettled
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[SW] Optional precache asset missed:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge obsolete caches and immediately claim open clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: route-aware offline caching strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only intercept GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Bypass SW cache for Supabase backend, API proxies, and deploy version polling
  // (Offline DB & Sync are handled by IndexedDB / RxDB; version.json must stay fresh)
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.endsWith('version.json')
  ) {
    return;
  }

  // 2. Navigation Requests (mode: 'navigate' or accept: text/html):
  // When an operator refreshes (F5) or enters a deep route while offline,
  // try network first; on failure, immediately serve the cached SPA index.html!
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          
          // First try matching the exact request (if previously visited)
          const matched = await cache.match(req);
          if (matched) return matched;

          // Otherwise fall back to the precached single-file bundle shell
          const shellFallbacks = ['./', './index.html', '/', '/index.html'];
          for (const key of shellFallbacks) {
            const shell = await cache.match(key);
            if (shell) return shell;
          }

          // Search all cached keys for any index.html
          const keys = await cache.keys();
          for (const cachedKey of keys) {
            if (cachedKey.url.endsWith('index.html') || cachedKey.url.endsWith('/')) {
              const res = await cache.match(cachedKey);
              if (res) return res;
            }
          }

          return new Response('App shell offline — please connect to network once.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 3. Static Assets (images, fonts, manifest, icons):
  // Stale-While-Revalidate with cache-first preference
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});

// Support manual skip-waiting trigger from update managers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
