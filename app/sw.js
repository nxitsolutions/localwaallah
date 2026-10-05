// Offline-first: the app shell is cached on install, everything else is cached as it is used.
const CACHE = 'localwaala-v11';
const SHELL = ['./', 'index.html', 'styles.css', 'i18n.js', 'app.js', 'milkman.webp', 'logo.webp', 'logo-mark.webp', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Sign-in and khata sync always go to the server, never to the cache.
  // Firebase's sign-in pages (/__/auth/…) are served through the same domain and must never be cached either.
  const path = new URL(e.request.url).pathname;
  if (path.includes('/api/') || path.includes('/__/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
