// Service worker: the site opens at once and works offline with the last loaded plan.
//
// - The app shell (index.html, with the CSS inside): served from the cache straight away, refreshed in the
//   background together with the scripts it references, so a cached page always has its script. A new
//   deploy therefore shows on the next start after it was downloaded (standard for installed web apps).
// - Data (data/*.json): network first, so a new version of the plan shows as soon as the phone is online;
//   the cached copy is used offline or when the network is too slow.
// - Built assets (assets/*-<hash>.js, names change with every build) and other static files (icons,
//   manifest, fixed names): cache first. Bump SHELL when an icon or the manifest changes.

const SHELL = "shell-v3"; // v3: new icons (0.4.1)
const DATA = "data-v1";
const SLOW_NETWORK_MS = 2500;
const MAX_ASSETS = 40;
const SHELL_URL = new URL("./", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(["manifest.webmanifest", "icons/icon.svg"]);
      await refreshShell();
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== DATA) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // every link (?t=…&gr=…#zmiany) opens the same app shell
    event.respondWith(shell(event));
  } else if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request, DATA, url.origin + url.pathname));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function shell(event) {
  const cached = await (await caches.open(SHELL)).match(SHELL_URL);
  const update = refreshShell();
  if (cached) {
    event.waitUntil(update.catch(() => undefined));
    return cached;
  }
  return update;
}

/** Download index.html and the assets it references; store the page only once its assets are stored. */
async function refreshShell() {
  const response = await fetch(SHELL_URL, { cache: "no-cache" });
  if (!response.ok) return response;
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => new URL(m[1], SHELL_URL).href);
  const cache = await caches.open(SHELL);
  await Promise.all(
    assets.map(async (url) => {
      if (!(await cache.match(url))) await cache.add(url);
    }),
  );
  await cache.put(SHELL_URL, response.clone());
  await trim(cache, assets);
  return response;
}

async function networkFirst(request, cacheName, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(key, response.clone());
    return response;
  });
  const cached = await cache.match(key);
  if (!cached) return network;
  // with a cached copy, don't wait long on a weak signal (the download still updates the cache)
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), SLOW_NETWORK_MS));
  return Promise.race([network.catch(() => cached), slow]);
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache, []);
  }
  return response;
}

/** Keep the cache small: the oldest entries go first, never the page (and, when refreshing it, not its assets). */
async function trim(cache, keep) {
  const keys = await cache.keys();
  const removable = keys.filter((k) => k.url !== SHELL_URL && !keep.includes(k.url));
  for (const old of removable.slice(0, Math.max(0, removable.length - MAX_ASSETS))) await cache.delete(old);
}
