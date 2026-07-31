/* ═══════════════════════════════════════════════════════════
   md2img — Service Worker（离线缓存）
   策略：本地资源 network-first + cache fallback；CDN 库 cache-first
   ═══════════════════════════════════════════════════════════ */
'use strict';

const CACHE = 'md2img-v3';

/* 注意：路径必须与仓库实际文件一一对应（此前的版本引用了不存在的
   md2img.html，导致 install 预缓存失败）。 */
const ASSETS = [
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/renderer.js',
  './js/exporter.js',
  './js/app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/marked@11.2.0/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      // 个别 CDN 资源失败不应阻塞安装：捕获后仍完成 install
      .catch(() => caches.open(CACHE).then((cache) =>
        Promise.allSettled(ASSETS.map((a) => cache.add(a)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 仅处理 GET 且同源或白名单 CDN
  if (e.request.method !== 'GET') return;
  const isCDN = url.host === 'cdn.jsdelivr.net';

  // CDN：cache-first（版本固定，极少变更）
  if (isCDN) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
    return;
  }

  // 本地：network-first，失败回退缓存（离线可用）
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
