// Yolda Kaldık service worker — push bildirimleri ve çevrimdışı kabuk
const CACHE = 'yk-v1';
const SHELL = ['/css/app.css', '/js/common.js', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Ağ öncelikli: her zaman güncel sürüm, ağ yoksa önbellek
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/css/app.css')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Yolda Kaldık', body: e.data ? e.data.text() : '' }; }
  const offer = d.data && d.data.type === 'offer';
  e.waitUntil(
    self.registration.showNotification(d.title || 'Yolda Kaldık', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      data: d.data || {},
      tag: d.data && d.data.jobId ? 'job-' + d.data.jobId : undefined,
      renotify: true,
      requireInteraction: offer,
      vibrate: offer ? [400, 150, 400, 150, 400] : [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith(url.split('#')[0]) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
