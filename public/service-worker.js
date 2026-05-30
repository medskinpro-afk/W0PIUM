/**
 * W0PIUM Service Worker
 *
 * Strategy:
 *   Static assets  → Cache First (versioned; bump CACHE_VER to invalidate)
 *   /api/*         → Network Only (never cache — always fresh)
 *   /disk/*        → Network Only (user files, auth-gated)
 *   /api/events    → Network Only (SSE stream)
 *   SPA shell      → Network First, fallback to cache
 */

const CACHE_VER = 'v48';
const CACHE_NAME = `w0pium-${CACHE_VER}`;

// JS + CSS are NOT precached — always network-first so deploys show instantly
// '/' is intentionally excluded — served network-first via navigate handler
const PRECACHE = [
  '/',
  '/utils/toast.js',
  '/utils/cn.js',
  '/pages/chat.js',
  '/pages/drops.js',
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => {}) // non-fatal — shell still works without precache
  );
});

// ── Activate: prune old cache versions ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('w0pium-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API responses, disk files, or SSE
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/disk/')
  ) return;

  // JS + CSS: network first, bypass HTTP cache so deploys show immediately
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(new Request(request.url, { cache: 'no-store' })).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Other static assets (images, fonts): cache first, update in background
  if (/\.(png|jpg|jpeg|webp|svg|woff2?|ttf|ico|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // SPA navigation: network first, cached shell as fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
});

// ── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'W0PIUM', body: '', url: '/' };
  try { data = { ...data, ...event.data?.json() }; } catch (e) { console.debug('Push data parse failed:', e.message); }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: data.tag || 'w0pium',
      data: { url: data.url },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate(url); }
      return clients.openWindow(url);
    })
  );
});
