// Notificaciones push con OneSignal (Web SDK v16).
//
// Se activa solo si existe VITE_ONESIGNAL_APP_ID y en producción (en dev no hay service worker).
// OneSignal tiene su PROPIO service worker en /push/onesignal/ (scope separado); el de la app
// (/sw.js) solo maneja el modo offline. Compartir el mismo archivo causaba un bucle de
// "Nueva versión disponible".
//
// Cada dispositivo queda identificado con:
//   external_id = id del usuario (para avisos a una persona)
//   tags: congregacion_id, rol, grupo_id (para avisos a una congregación / grupo / rol)
// Al enviar desde OneSignal o la Edge Function, el campo "url" es el link de navegación
// (p. ej. https://<dominio>/alerts) que se abre al tocar la notificación.

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

export const oneSignalDisponible = () => Boolean(APP_ID) && import.meta.env.PROD;

let iniciado = false;

// Ejecuta fn(OneSignal) cuando el SDK esté listo
const conOneSignal = (fn) => {
  if (!oneSignalDisponible()) return Promise.resolve(null);
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve) => {
    window.OneSignalDeferred.push(async (OneSignal) => {
      try { resolve(await fn(OneSignal)); } catch (err) { console.warn('[OneSignal]', err); resolve(null); }
    });
  });
};

export const initOneSignal = () => {
  if (!oneSignalDisponible() || iniciado) return;
  iniciado = true;
  const script = document.createElement('script');
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.defer = true;
  document.head.appendChild(script);
  conOneSignal((OneSignal) => OneSignal.init({
    appId: APP_ID,
    // Worker propio de OneSignal en su carpeta (ver public/push/onesignal/). Debe coincidir con
    // OneSignal → Settings → Web → Service workers.
    serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
    serviceWorkerParam: { scope: '/push/onesignal/' },
    notifyButton: { enable: false },
    // Usamos nuestro propio aviso para pedir permiso (App.jsx)
    promptOptions: { autoPrompt: false },
  }));
};

// Vincula el dispositivo con el usuario y sus etiquetas (congregación, rol, grupo)
export const identificarUsuario = (user, grupoId = null) => conOneSignal(async (OneSignal) => {
  if (!user?.id) return;
  await OneSignal.login(String(user.id));
  const tags = { rol: user.rol || '', congregacion_id: user.congregacion_id || '' };
  tags.grupo_id = grupoId ? String(grupoId) : '';
  await OneSignal.User.addTags(tags);
});

export const olvidarUsuario = () => conOneSignal((OneSignal) => OneSignal.logout());

// Estado del permiso del navegador: 'granted' | 'denied' | 'default' | 'unsupported'
export const estadoPermisoPush = () =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

// Pide permiso de notificaciones y suscribe el dispositivo. Devuelve true si quedó concedido.
export const pedirPermisoPush = async () => {
  if (oneSignalDisponible()) {
    const ok = await conOneSignal(async (OneSignal) => {
      await OneSignal.Notifications.requestPermission();
      // Si el permiso ya estaba dado antes de OneSignal, hay que suscribir explícitamente
      if (OneSignal.Notifications.permission) await OneSignal.User.PushSubscription.optIn();
      return OneSignal.Notifications.permission;
    });
    return Boolean(ok);
  }
  if (typeof Notification === 'undefined') return false;
  return (await Notification.requestPermission()) === 'granted';
};
