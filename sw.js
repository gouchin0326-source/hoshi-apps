// ★HOSHI 管制塔 PWA サービスワーカー
// 役割: アプリ外殻(HTML/アイコン)をキャッシュしてオフラインでも即開く。
//       ただし status.json は常に最新をネットワークから取る(失敗時のみ最後の値)。
const CACHE = 'hoshi-kanseito-v18';
const SHELL = [
  './',
  'home.html',
  'dev.html',
  'samples.html',
  'make.html',
  'works.html',
  'pr.html',
  'status.html',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
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
  const url = new URL(e.request.url);
  // 状況データは常に最新をネットワークから（失敗時のみキャッシュにフォールバック）
  if (url.pathname.endsWith('status.json') || url.pathname.endsWith('apps.json')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // ★HTMLページ(部署ページ/作品ページ等)とアプリ配下は「ネットワーク優先」＝スマホで常に最新を表示。
  //   オフライン/PC停止時のみキャッシュへフォールバック。← 旧cache-firstがスマホ旧版固定の原因だった。
  const isHTML = e.request.mode === 'navigate'
              || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isHTML || url.pathname.includes('/puzzle/')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('home.html')))
    );
    return;
  }
  // 静的アセット(アイコン/manifest/media等)はキャッシュ優先＝即表示・オフライン耐性
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('home.html')))
  );
});
