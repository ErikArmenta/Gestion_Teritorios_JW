// Avisos de errores (Migración 14): cuando algo truena en el teléfono de alguien se guarda en `errores_app`
// (función reportar_error; el mismo error suma "veces") y el Super Admin lo ve en Backup → Errores de la app.
// Sin la migración no pasa nada. Nunca debe causar otro error: todo va en try/catch y en silencio.
import { supabase } from '../supabaseClient';

const MAX_POR_SESION = 20;
const REPETIR_CADA_MS = 10 * 60_000;
let enviados = 0;
const ultimos = new Map(); // firma → hora del último envío

// Ruido del navegador que no es un error de la app
const IGNORAR = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /NotAllowedError/i, // el usuario canceló (huella, cámara, notificaciones…)
];

// Huella corta y estable: mensaje + primera línea útil de la pila (sin números de línea que cambian por build)
function firma(mensaje, pila) {
  const linea = String(pila || '').split('\n').find((l) => /at |@/.test(l)) || '';
  const base = `${mensaje}|${linea.replace(/[?#].*$/, '').replace(/:\d+:\d+\)?$/, '').replace(/-[\w]{6,}\.js/, '.js')}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return `e${h.toString(36)}${base.length.toString(36)}`;
}

const version = () => {
  try {
    const s = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || '';
    return s.match(/index-([\w-]+)\.js/)?.[1] || 'dev';
  } catch { return 'dev'; }
};

export function reportarError(err, extra = '') {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const mensaje = String(err?.message || err || 'Error desconocido').slice(0, 500);
    if (!mensaje || IGNORAR.some((r) => r.test(mensaje))) return;
    const pila = [err?.stack, extra].filter(Boolean).join('\n').slice(0, 4000);
    const f = firma(mensaje, err?.stack);
    const ahora = Date.now();
    if (enviados >= MAX_POR_SESION || ahora - (ultimos.get(f) || 0) < REPETIR_CADA_MS) return;
    ultimos.set(f, ahora);
    enviados += 1;
    supabase.rpc('reportar_error', {
      p_firma: f,
      p_mensaje: mensaje,
      p_pila: pila || null,
      p_ruta: (location.pathname + location.search).slice(0, 200),
      p_navegador: navigator.userAgent.slice(0, 300),
      p_version: version(),
    }).then(() => {}, () => {});
  } catch { /* nunca romper por reportar */ }
}

// Errores que se escapan de todo (se instala una vez en main.jsx)
export function instalarReporteDeErrores() {
  try {
    window.addEventListener('error', (e) => reportarError(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => reportarError(e.reason));
  } catch { /* nada */ }
}
