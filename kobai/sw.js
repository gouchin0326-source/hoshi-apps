/* 購買サーチ Service Worker
   ① 外殻(HTML/JS/アイコン/OCRエンジン)はキャッシュ、データはネット直行
   ② スマホの「共有→購買サーチ」を受け取る（Web Share Target）。
      共有はPOSTで来る→SWがサーバー無しで受け取り、キャッシュに一時保存→?shared=1 へ誘導。
      画像(スクショ)はアプリ側でOCR、URL/テキストはそのままリスト化する。 */
const CACHE = "kobai-search-v2";
const SHARE_CACHE = "kobai-share-v1";   // 共有ペイロードの一時置き場（activateで消さない）
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./ocr_postprocess.js",
  "./team_basket.html",
  "./lib/chart.umd.min.js",
  "./lib/xlsx.full.min.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ---- Web Share Target: 共有はPOSTで /share-target に来る ----
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const meta = {
          title: form.get("title") || "",
          text: form.get("text") || "",
          url: form.get("url") || ""
        };
        const image = form.get("image");
        const cache = await caches.open(SHARE_CACHE);
        await cache.put("__share_meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
        if (image && image.size) {
          await cache.put("__share_img", new Response(image, { headers: { "Content-Type": image.type || "image/png" } }));
        } else {
          await cache.delete("__share_img");
        }
      } catch (err) { /* 失敗しても画面は開く */ }
      // 受け取ったらアプリ本体へ（GETナビゲーション）。ここで処理は走らせない＝アプリ側で拾う
      return Response.redirect(new URL("./?shared=1", e.request.url).href, 303);
    })());
    return;
  }

  if (e.request.method !== "GET") return;
  // 同一オリジンの外殻のみ扱う（外部ドメインはSWを介さずネット直行）
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/data/")) return;
  // 外殻はネット優先→失敗時キャッシュ（オフラインでも起動する）
  e.respondWith(
    fetch(e.request)
      .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp).catch(() => {})); return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
  );
});
