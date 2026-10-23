// 감지 알림 Web Push 전용 최소 service worker (캐싱 없음)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Earthquake Monitor', body: '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Earthquake Monitor', {
      body: data.body || '',
      tag: data.tag || 'eqm-detect',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
