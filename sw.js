/* Recall service worker — content version v6
   Strategy:
   - app HTML (navigations): network-first, fall back to cached copy when offline
     so students always get the latest content when they have signal, but the app
     still opens with no connection.
   - same-origin static assets (icons, manifest): cache-first.
   - Google Fonts: cached on first online use, so fonts survive offline too.
   The cache name carries the content version, so each new build evicts the old cache. */
const CACHE  = 'recall-v6';
const FONTS  = 'recall-fonts-v6';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, FONTS]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts (cross-origin): stale-while-revalidate so they work offline after first load.
  if (url.host.endsWith('googleapis.com') || url.host.endsWith('gstatic.com')) {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const cached = await c.match(req);
      const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => null);
      return cached || (await net) || Response.error();
    })());
    return;
  }

  if (url.origin !== self.location.origin) return; // leave anything else to the network

  // App shell navigations: network-first.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Other same-origin assets: cache-first.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, net.clone());
      return net;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
