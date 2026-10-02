const CACHE_PREFIX = "arstinla-imgtool-";
const CACHE = CACHE_PREFIX + "v4";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "/tools/shared/download-gate.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))
    ))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put("./index.html", res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok || res.type === "opaque") {
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => Response.error()))
  );
});
