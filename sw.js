// md2img Service Worker — offline cache
const CACHE = 'md2img-v1';
const ASSETS = [
  './md2img.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/marked@11/marked.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
];

// Install: pre-cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: purge old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: cache-first for CDN scripts, network-first for local files
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // CDN scripts → cache first (rarely change)
  if (url.host === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Local files → network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Update cache with fresh response
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
