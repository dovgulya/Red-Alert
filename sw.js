const CACHE_NAME = 'red-alert-v6';
const BASE_PATH = '/Red-Alert/';
const ASSETS = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}style.css`,
  `${BASE_PATH}app.js`,
  `${BASE_PATH}db.js`,
  `${BASE_PATH}calc.js`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`
];

// Install: precache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Cache First
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Google Fonts API (let network handle, cache response)
  const url = new URL(event.request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
