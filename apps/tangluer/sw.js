const CACHE = "arstinla-tangluer-v1";
const SHARE = "tangluer-share";
const CORE = ["./", "./index.html", "./slip-parse.js", "./manifest.webmanifest", "./icons/icon-192.png", "../shared/pwa-install.css", "../shared/pwa-install.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("arstinla-tangluer-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// รับสลิปที่ผู้ใช้กด "แชร์" มาจากแอปอื่น เก็บไว้ชั่วคราวแล้วเปิดหน้าแอปให้อ่านต่อ
async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll("slips").filter((f) => f && typeof f !== "string");
  const cache = await caches.open(SHARE);
  await Promise.all(files.map((file, i) => cache.put(
    `./__shared/${Date.now()}-${i}`,
    new Response(file, { headers: { "Content-Type": file.type || "image/jpeg", "x-modified": String(file.lastModified || Date.now()) } })
  )));
  return Response.redirect(`./?shared=${files.length}`, 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share-target")) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
