// Service Worker — Gestion Territorios JW
// IMPORTANTE: subir CACHE_VERSION cuando cambie la lógica de este archivo.

// Las notificaciones push NO pasan por aquí: OneSignal tiene su propio service worker en
// /push/onesignal/ (scope separado). Si ambos usaran este archivo, el navegador los vería como
// versiones distintas y se reemplazarían sin fin ("Nueva versión disponible" en bucle).

const CACHE_VERSION = 'v4';
const SHELL_CACHE = `territorial-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `territorial-assets-${CACHE_VERSION}`;
const DATA_CACHE = `territorial-data-${CACHE_VERSION}`;
const TILE_CACHE = `territorial-tiles-${CACHE_VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE, TILE_CACHE];

const MAX_TILES = 600;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// --- INSTALL: pre-cache app shell ---
// No llamamos skipWaiting aquí: la app muestra "Nueva versión disponible"
// y el usuario decide cuándo actualizar (mensaje SKIP_WAITING).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- ACTIVATE: cleanup old caches ---
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const trimCache = async (name, max) => {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
};

const putInCache = (cacheName, request, response) => {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  const cloned = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, cloned));
};

const networkFirst = (request, cacheName) =>
  fetch(request)
    .then((response) => {
      putInCache(cacheName, request, response);
      return response;
    })
    .catch(() => caches.match(request));

const cacheFirst = (request, cacheName) =>
  caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      putInCache(cacheName, request, response);
      return response;
    });
  });

// --- FETCH: estrategia por tipo de request ---
self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Solo GET se puede cachear (POST/PATCH/DELETE de Supabase pasan directo)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // Supabase: auth y realtime nunca se cachean
  if (url.hostname.includes('supabase.co')) {
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')) return;
    e.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Tiles del mapa: cache-first con límite de entradas
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname)) {
    e.respondWith(
      cacheFirst(request, TILE_CACHE).then((res) => {
        trimCache(TILE_CACHE, MAX_TILES);
        return res;
      })
    );
    return;
  }

  // Navegación (SPA): network-first, fallback a index.html cacheado
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(SHELL_CACHE, '/index.html', response);
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos (los de Vite llevan hash en el nombre): cache-first
  // Solo assets propios (con hash de Vite) y fuentes; scripts de terceros (OneSignal) siempre de la red
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|ico)$/.test(url.pathname);
  if ((isStaticAsset && url.origin === self.location.origin) || url.hostname.includes('fonts.g')) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

// --- CLIC en notificaciones LOCALES de la app (showSystemNotification en src/utils/pwa.js) ---
// Los push los recibe y muestra OneSignal, y su SDK abre el "url" con que se enviaron.
self.addEventListener('notificationclick', (e) => {
  if (!e.notification.data?.local) return;
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        existing.focus();
        return existing.navigate ? existing.navigate(target) : undefined;
      }
      return self.clients.openWindow(target);
    })
  );
});
