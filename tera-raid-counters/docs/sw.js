// Bump this whenever any cached file changes so phones pick up the new version.
const CACHE = 'raid-counters-v3';

const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/main.js',
  'js/engine.js',
  'js/strategy.js',
  'js/types.js',
  'data/raids.json',
  'data/pokemon.json',
  'data/moves.json',
  'data/pool.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first so updates show up on the next load; the cache only answers when offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
