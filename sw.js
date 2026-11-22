const CACHE_NAME = 'ruta-flash-v2.0.0';
const MAP_CACHE = 'ruta-flash-maps-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== MAP_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Guardar en caché mosaicos de OpenStreetMap cuando hay red
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(MAP_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const networkFetch = fetch(e.request).then((res) => {
            if (res && res.status === 200) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.url.includes('unpkg.com/leaflet'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
