/**
 * Nagimals Service Worker.
 *
 * Three jobs:
 *   1. An offline shell, so the app opens without a network.
 *   2. Receiving push messages and showing them.
 *   3. Focusing an existing window on notification click, and deep-linking to
 *      the responsibility that escalated.
 *
 * Deliberately conservative: navigation is network-first so a deploy is picked
 * up promptly, and static assets are cache-first.
 */

const VERSION = 'nagimals-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = ['./', './index.html', './manifest.webmanifest', './offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, falling back to the cached shell, then offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          return cached ?? caches.match('./offline.html');
        }),
    );
    return;
  }

  // Static assets: cache first, refreshed in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Nagimals', body: event.data ? event.data.text() : 'Something needs you.' };
  }

  const title = payload.title || 'Nagimals';
  const options = {
    body: payload.body || 'A household member needs your attention.',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/badge-72.png',
    tag: payload.eventId || 'nagimals',
    renotify: false,
    requireInteraction: payload.stage >= 4,
    data: {
      deepLink: payload.deepLink || './index.html#/household',
      nagimalId: payload.nagimalId || null,
      responsibilityId: payload.responsibilityId || null,
      stage: payload.stage ?? null,
      state: payload.state || null,
      soundKey: payload.soundKey || null,
    },
    actions: [
      { action: 'open', title: 'Open the household' },
      { action: 'dismiss', title: 'Not now' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const target = data.deepLink || './index.html#/household';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Prefer focusing a window that is already open.
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({
              type: 'nagimals:notification-click',
              responsibilityId: data.responsibilityId,
              nagimalId: data.nagimalId,
              stage: data.stage,
              state: data.state,
              soundKey: data.soundKey,
            });
            return client.focus().then((focused) => {
              if ('navigate' in focused && target) {
                return focused.navigate(target).catch(() => focused);
              }
              return focused;
            });
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
