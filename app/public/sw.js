// Self-destructing service worker.
// The old PWA registered /sw.js with aggressive caching; this replaces it,
// wipes every cache, unregisters itself, and reloads open tabs so returning
// visitors get the new app instead of the cached old one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
