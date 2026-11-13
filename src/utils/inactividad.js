// Cierre de sesión por inactividad: a los 14 min sin tocar la app sale "¿Sigues ahí?" con 60 s de cuenta
// regresiva; sin respuesta, a los 15 min se cierra la sesión. La última actividad se guarda en localStorage
// para que todas las pestañas compartan el mismo reloj (y para saber cuánto pasó con la app cerrada).
export const MINUTOS_INACTIVIDAD = 15;
export const SEGUNDOS_AVISO = 60;
export const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000;
export const AVISO_MS = LIMITE_MS - SEGUNDOS_AVISO * 1000;

const CLAVE = 'territorial_actividad';

export function ultimaActividad() {
  try { return Number(localStorage.getItem(CLAVE)) || 0; } catch { return 0; }
}
export function anotarActividad(ahora = Date.now()) {
  try { localStorage.setItem(CLAVE, String(ahora)); } catch { /* sin almacenamiento */ }
}

// { fase: 'activo' } | { fase: 'aviso', segundos } | { fase: 'cerrar' }
export function faseInactividad(ultima, ahora = Date.now()) {
  const quieto = ahora - ultima;
  if (quieto >= LIMITE_MS) return { fase: 'cerrar' };
  if (quieto >= AVISO_MS) return { fase: 'aviso', segundos: Math.max(1, Math.ceil((LIMITE_MS - quieto) / 1000)) };
  return { fase: 'activo' };
}
