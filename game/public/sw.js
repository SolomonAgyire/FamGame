/* WordIn service worker.
 *
 * Its job is narrow on purpose: make the game open and play when the phone
 * has no signal, without ever serving a stale room. Two rules:
 *
 *   - /api/* is never cached. Online rooms are live state; a cached snapshot
 *     would show a room that no longer exists.
 *   - Everything else is network-first with a cache fallback, so a deploy is
 *     picked up as soon as the network allows and the last good copy is
 *     still there when it does not.
 *
 * Progress lives in localStorage, not here. This worker does not touch it.
 */

const VERSION = 'wordin-v1';
const SHELL = `${VERSION}-shell`;

// Only the things needed to render something playable offline. The audio
// files are several megabytes each and are deliberately left out -- music is
// not worth a player's storage quota.
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // Individual failures must not fail the whole install, or a single
      // 404 leaves the app with no worker at all.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live room state must always come from the server.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation that missed the cache still gets the app shell, so
        // the player sees the game rather than the browser's offline page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
