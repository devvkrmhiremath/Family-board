// Makes the Home Screen app open instantly and work offline.
// Strategy: stale-while-revalidate. Every request is answered straight from the
// cache, and the network copy is fetched in the background for next time. When
// this file changes (bump VERSION), the new worker installs fresh files and the
// page reloads into them on its own, so nobody has to close the app twice.
const VERSION = "fb-v10";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the HTTP cache so a new version really gets new files
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!sameOrigin && !firebaseSdk) return; // Firestore traffic goes straight to the network

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // Invite links carry ?family=…; they're all the same page
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    const network = fetch(req)
      .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) {
      e.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    if (fresh) return fresh;
    // Offline and not cached: opening the app still works; other files just fail
    if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  })());
});
