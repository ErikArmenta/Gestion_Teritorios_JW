// Service worker de OneSignal (solo notificaciones push), en su propia carpeta/scope
// para no competir con el service worker de la app (/sw.js, modo offline).
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
