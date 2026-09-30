const CACHE_VERSION = "londe-pwa-v1";
const APP_SHELL = `${CACHE_VERSION}-shell`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const SHELL_FILES = [
  "/", "/index.html", "/offline.html", "/manifest.webmanifest",
  "/css/style.css", "/css/dark-theme.css", "/js/api.js", "/js/shop.js",
  "/js/pwa.js", "/images/londe-logo.png", "/images/pwa-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("londe-pwa-") && ![APP_SHELL, PAGE_CACHE, IMAGE_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isProductApi(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/products") && !url.pathname.includes("/admin");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isProductApi(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.json({ error: "Офлайн. Підключіться до мережі, щоб переглянути актуальний каталог." }, { status: 503 });
      }
    })());
    return;
  }

  if (request.destination === "image") {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !url.pathname.startsWith("/admin")) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(PAGE_CACHE);
        return (await cache.match(request)) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (request.destination === "script" || request.destination === "style" || url.pathname.endsWith(".webmanifest"))) {
      const cache = await caches.open(APP_SHELL);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
