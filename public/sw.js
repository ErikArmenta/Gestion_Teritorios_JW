// Service Worker — Gestion Territorios JW
// TODO: Configurar VAPID keys en Supabase Edge Function para envío server-side de push

const CACHE_NAME = 'territorial-jw-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// --- INSTALL: pre-cache app shell ---
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// --- ACTIVATE: cleanup old caches ---
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => clients.claim())
  );
});

// --- FETCH: estrategia por tipo de request ---
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Network-first: Supabase API o JSON
  if (
    url.hostname.includes('supabase.co') ||
    request.headers.get('Accept')?.includes('application/json')
  ) {
    e.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first: assets estáticos (.js, .css, imágenes, fuentes)
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|ico)$/.test(url.pathname);
  if (isStaticAsset) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        });
      })
    );
    return;
  }

  // Fallback: navegación → servir /index.html desde caché
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }
});

// --- PUSH: alertas de pánico ---
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
