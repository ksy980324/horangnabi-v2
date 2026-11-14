// Filled by Vite for production. Keep this URL stable for existing offline saves.
const APP_VERSION = 'development';
const APP_ASSETS = [];
const offlineCache = 'horangnabi-v2:offline-page-v1';
const scope = self.registration.scope;
const base = new URL(scope);
const cachePrefix = `horangnabi-v2:app:${base.pathname}:`;
const appCache = cachePrefix + APP_VERSION;
const offlineUrl = new URL('offline.html', scope).href;
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(appCache).then(cache => cache.addAll(APP_ASSETS.map(path => new URL(path, scope).href))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = (await caches.keys()).filter(key => key.startsWith(cachePrefix) && key !== appCache);
    // Keep one previous build for open tabs; preserve saved trips and other apps.
    await Promise.all(versions.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function offlineViewer() {
  return await caches.match(offlineUrl, { cacheName: appCache })
    ?? await caches.match(offlineUrl, { cacheName: offlineCache });
}
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method && request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  if (request.mode === 'navigate') {
    url.search = '';
    if (url.href === offlineUrl) {
      event.respondWith(fetch(request, { cache: 'no-cache' }).catch(async () => await offlineViewer() ?? Response.error()));
    } else if (url.href === scope || url.href === indexUrl) {
      // Authenticated HTML is always fresh; offline opens the read-only viewer.
      event.respondWith(fetch(request, { cache: 'no-cache' }).catch(async () =>
        await offlineViewer() ? Response.redirect(offlineUrl) : Response.error()));
    }
    return;
  }
  // Cache content-hashed code only, never auth, Firestore, maps, search or photos.
  const relativePath = url.pathname.slice(base.pathname.length);
  if (url.search || !/^assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(relativePath)) return;
  event.respondWith((async () => {
    const cache = await caches.open(appCache);
    const cached = await cache.match(request);
    if (cached) return cached;
    for (const name of (await caches.keys()).filter(name => name.startsWith(cachePrefix) && name !== appCache)) {
      const previous = await (await caches.open(name)).match(request);
      if (previous) return previous;
    }
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      try { await cache.put(request, response.clone()); } catch { /* A full cache must not block loading. */ }
    }
    return response;
  })());
});
