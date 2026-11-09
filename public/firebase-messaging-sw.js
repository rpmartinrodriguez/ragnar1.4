/* Web Push worker de Ragnar. No contiene credenciales privadas. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { data: { body: event.data?.text() || '' } }; }
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'Ragnar Training';
  const body = data.body || payload.notification?.body || 'Tenés una novedad en tu entrenamiento.';
  const target = data.url || '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.eventKey || undefined,
    data: { url: target }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === url.origin);
    if (existing) {
      await existing.focus();
      existing.navigate(url.href);
    } else {
      await self.clients.openWindow(url.href);
    }
  })());
});
