/* Roost phone viewer — service worker.
 *
 * Why this exists: without a registered service worker that has a fetch handler,
 * Android Chrome does not consider the site installable, so "Add to Home screen"
 * makes a plain bookmark that opens in a browser tab WITH the address bar. The
 * manifest alone is not enough. This is what makes the home-screen icon launch
 * standalone, like an app.
 *
 * Caching policy is deliberately NETWORK-FIRST. This is a money viewer: showing
 * yesterday's numbers because they were cached would be worse than showing
 * nothing. The cache is only a fallback for when the phone is actually offline.
 * Firestore/Firebase traffic is cross-origin and is never touched here.
 */
const VERSION = "roost-v8";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", event => {
  // Take over immediately so an update isn't stuck behind the old worker.
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .catch(() => {})          // a missing file must never block installation
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  // Only same-origin GETs. Firebase auth/Firestore calls pass straight through:
  // caching them would be both useless and a privacy problem.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-store" });
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (e) {
      // Offline: fall back to whatever we have, then to the app shell so a
      // navigation still opens the app rather than the browser's error page.
      // ignoreSearch: the start_url and any ?query land on the same page, and a
      // miss here is not just a cosmetic offline failure - Chrome's install
      // check fetches start_url through this worker, and a page that can't
      // answer it is treated as not installable.
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
