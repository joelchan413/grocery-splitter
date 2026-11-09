// GrocerySplit service worker: shows push notifications and opens the right screen when one is tapped.
// It caches nothing, so the app always loads fresh from the server.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'GrocerySplit';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open this app's own pages.
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // A full load, so the app reads the trip and screen from the address.
        await open.focus();
        if ('navigate' in open) return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })()
  );
});

// Browsers occasionally renew a subscription. Move the new one to the same roommate.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      let subscription = event.newSubscription;
      if (!subscription) {
        const res = await fetch('/api/push', { cache: 'no-store' });
        const { publicKey } = await res.json();
        if (!publicKey) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
      }
      // Without the old endpoint the server can't tell whose device this is. The app saves the
      // new subscription for the right roommate the next time it is opened.
      if (!oldEndpoint) return;
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replaces: oldEndpoint, subscription: subscription.toJSON() }),
      });
    })()
  );
});
