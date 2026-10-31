// Network-first assets keep team themes and app updates fresh, with cached offline fallback.
const CACHE = "cafeos-shell-v3";
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(["/", "/icon.svg", "/manifest.webmanifest"]),
      ),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/receipt/")
  )
    return;
  const navigation = event.request.mode === "navigate";
  const asset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/menu/") ||
    ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname);
  if (!navigation && !asset) return;
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok && asset) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(event.request)) ||
          (navigation ? await caches.match("/") : undefined) ||
          Response.error(),
      ),
  );
});
