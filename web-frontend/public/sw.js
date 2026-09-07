const CACHE_NAME = 'dahonmd-shell-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/apple-touch-icon.png', '/assets/brand/dahonmd-logo-green.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin
      || url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
        return response;
      })
      .catch(() => caches.match('/')));
    return;
  }

  const cacheableAsset = url.pathname.startsWith('/assets/')
    || ['/manifest.webmanifest', '/favicon.png', '/apple-touch-icon.png'].includes(url.pathname);
  if (!cacheableAsset) return;

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    });
    return cached || network;
  }));
});
