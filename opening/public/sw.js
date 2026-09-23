/**
 * Retires the old root-scoped Nagimals service worker.
 *
 * Nagimals used to be served from "/" and registered /sw.js for the whole
 * origin. It now lives in /app/ with its own worker. Returning browsers still
 * hold the old registration, which would keep answering "/" from its cache;
 * this replacement clears those caches and unregisters itself.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nagimals-')).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
