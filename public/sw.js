// Service Worker — Gestion Territorios JW
// TODO: Configurar VAPID keys en Supabase Edge Function para envío server-side de push

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('push', (e) => {
  const d = e.data.json();
  e.waitUntil(
    self.registration.showNotification('🚨 ALERTA DE EMERGENCIA', {
      body: d.nombre + ' necesita ayuda — ' + d.tipo,
      icon: '/JW.jpg',
      badge: '/JW.jpg',
      vibrate: [500, 200, 500, 200, 500],
      requireInteraction: true,
      tag: 'panic-alert',
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
