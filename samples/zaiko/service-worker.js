const CACHE = 'hoshi-app-v1';
const ASSETS = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function () { self.clients.claim(); });
self.addEventListener('fetch', function (e) {
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
