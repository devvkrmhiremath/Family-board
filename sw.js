// Makes the installed app open instantly and work offline.
// Strategy: stale-while-revalidate. Every request for this site's files is answered
// straight from the cache, and a fresh copy is fetched in the background for next
// time. When this file changes (bump VERSION), the new worker installs fresh files
// and the page reloads into them on its own.
// Keep SHELL in sync with the files on disk: `npm run check:sw` verifies it.
const VERSION = "fb-v12";
const SHELL = [
  "./", "index.html", "styles.css", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "src/app/actions.js",
  "src/app/hooks.js",
  "src/app/people.js",
  "src/app/render.js",
  "src/app/session.js",
  "src/app/setup.js",
  "src/app/state.js",
  "src/core/constants.js",
  "src/core/groceries.js",
  "src/core/ids.js",
  "src/core/photo.js",
  "src/core/platform.js",
  "src/core/store.js",
  "src/core/time.js",
  "src/data/demo.js",
  "src/data/firebase.js",
  "src/data/local-boards.js",
  "src/data/service.js",
  "src/features/backup.js",
  "src/features/boards-sheet.js",
  "src/features/edit-sheet.js",
  "src/features/install.js",
  "src/features/invites.js",
  "src/features/lifecycle.js",
  "src/features/search-sheet.js",
  "src/features/settings-sheet.js",
  "src/main.js",
  "src/ui/controls.js",
  "src/ui/dom.js",
  "src/ui/history.js",
  "src/ui/icons.js",
  "src/ui/motion.js",
  "src/ui/sheets.js",
  "src/ui/toast.js",
  "src/views/composer.js",
  "src/views/home.js",
  "src/views/lists.js",
  "src/views/rows.js",
  "src/views/status.js",
  "vendor/firebase/13.1.0/firebase-app-check.js",
  "vendor/firebase/13.1.0/firebase-app.js",
  "vendor/firebase/13.1.0/firebase-auth.js",
  "vendor/firebase/13.1.0/firebase-firestore.js",
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
  if (url.origin !== self.location.origin) return; // Firebase traffic goes straight to the network

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // Invite links carry ?join=…; they're all the same page
    const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    const network = fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      })
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
