const cacheName = 'horangnabi-v2:offline-page-v1';
const scope = self.registration.scope;
const offlineUrl = new URL('offline.html', scope).href;
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  url.search = '';
  if (url.href === offlineUrl) {
    event.respondWith(fetch(request).catch(async () =>
      await caches.match(offlineUrl, { cacheName }) ?? Response.error()));
  } else if (url.href === scope || url.href === indexUrl) {
    event.respondWith(fetch(request, { cache: 'reload' }).catch(async () =>
      await caches.match(offlineUrl, { cacheName }) ? Response.redirect(offlineUrl) : Response.error()));
  }
});
