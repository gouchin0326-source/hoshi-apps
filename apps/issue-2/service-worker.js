// ★HOSHI ハブ安全SW（2026-07 差し替え）
// 旧SWは activate で「全キャッシュ削除」していた → キャッシュはオリジン単位で共有のため、
// このアプリを開くだけでハブ/他アプリのキャッシュまで消え、オフライン時にハブへ戻れない
// "抜け"の原因になっていた（Workbox issue #1344 と同型の既知の落とし穴）。
// 対策: キャッシュを一切触らず、ネットワークにそのまま通すだけ（常時オンライン配信のため無害）。
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => { /* 介入しない＝ブラウザ既定のネットワーク取得 */ });
