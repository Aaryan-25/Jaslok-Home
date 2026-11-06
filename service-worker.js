// Jaslok Homecare app shell. Network first (so updates show at once), cached copy when offline.
// Bump VERSION whenever you change a file.
const VERSION = 'jaslok-homecare-v4.0.0';
const SHELL = ['./', './index.html', './portal.html', './admin.html', './nurse.html', './vendor/qrcode.js', './css/site.css', './js/config.js', './js/store.js', './js/common.js', './js/admin-portal.js',
  './manifest.json', './vendor/exceljs.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // database, maps, fonts: never cached here
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}))
  );
});
