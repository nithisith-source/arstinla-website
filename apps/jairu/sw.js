const CACHE = "arstinla-jairu-v1";
const CORE = ["./", "./manifest.webmanifest", "./spirit.js?v=3", "../shared/pwa-install.css", "../shared/pwa-install.js", "../shared/arstinla-member.js",
  "./art/stage0.webp?v=1", "./art/stage1.webp?v=1", "./icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("arstinla-jairu-") && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Network first; never cache the member API or Pro lessons.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && !response.redirected) { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
