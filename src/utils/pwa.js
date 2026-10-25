// Registro del Service Worker + estado de instalación PWA.
// Los componentes se suscriben con onPwaChange() y leen getPwaState().

const state = {
  installPrompt: null,   // evento beforeinstallprompt diferido (Android / Chrome / Edge)
  waitingWorker: null,   // SW nuevo esperando para activarse
};
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn({ ...state }));

export const getPwaState = () => ({ ...state });

export const onPwaChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const promptInstall = async () => {
  const evt = state.installPrompt;
  if (!evt) return false;
  evt.prompt();
  const { outcome } = await evt.userChoice;
  state.installPrompt = null;
  emit();
  return outcome === 'accepted';
};

export const applyUpdate = () => {
  state.waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
};

const trackWaiting = (reg) => {
  if (reg.waiting && navigator.serviceWorker.controller) {
    state.waitingWorker = reg.waiting;
    emit();
  }
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => {
      // Solo es "actualización" si ya había un SW controlando la página
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        state.waitingWorker = sw;
        emit();
      }
    });
  });
};

export const registerPwa = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    emit();
  });

  if (!('serviceWorker' in navigator)) return;

  // En dev el SW cachearía los módulos de Vite y rompería el HMR (archivos viejos
  // mezclados con nuevos → pantalla en blanco). Si quedó uno instalado de antes, se quita.
  if (!import.meta.env.PROD) {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map(r => r.unregister()));
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Recargar una vez ya sin el SW controlando la página
      if (navigator.serviceWorker.controller) window.location.reload();
    }).catch(() => {});
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        trackWaiting(reg);
        // Buscar nuevas versiones cada hora (la app suele quedar abierta)
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => console.warn('[PWA] Error registrando SW:', err));
  });
};

// Muestra una notificación del sistema. En Android / app instalada
// `new Notification()` lanza error, así que se usa el SW cuando existe.
export const showSystemNotification = async (title, options) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      // data.local: el SW solo maneja el clic de notificaciones propias (no las de OneSignal)
      await reg.showNotification(title, { ...options, data: { ...(options?.data || {}), local: true } });
      return;
    }
    new Notification(title, options);
  } catch {
    // Notificaciones no soportadas en este navegador
  }
};
