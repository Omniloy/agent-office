// Shows the notifications hub.mjs sends to this phone, and opens the right office when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch { /* an empty push still has to show something */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Omniloy HQ', { body: d.body || '', tag: d.tag || undefined, icon: '/icon-180.png', data: { port: d.port, hash: d.hash || '' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {}, here = !d.port || String(d.port) === self.location.port;
  const hash = here ? (d.hash || '') : `go=${d.port}/${d.hash || ''}`; // another office: this app opens and hops there
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) { try { await c.focus(); c.postMessage({ hash }); return; } catch { /* try the next one */ } }
    await self.clients.openWindow(`/${hash ? `#${hash}` : ''}`);
  })());
});
