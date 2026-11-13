// Sesión firmada (paso 1 del blindaje). La Edge Function `sesion` revisa usuario/contraseña en el servidor
// y entrega un token firmado (usuario_id, congregacion_id, rol). `supabaseClient` lo manda en cada consulta.
// Si la función no existe o no firma (sin secreto), todo sigue como antes: login directo + llave pública.
// No importar supabaseClient aquí (él importa este archivo).

const URL_FUNCION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sesion`;
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY;
const CLAVE = 'territorial_token';
const RENOVAR_CADA_MS = 24 * 3600 * 1000;

const leer = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
};

// { token, expira (segundos), obtenido (ms) } | null
export function guardarToken(r) {
  try {
    if (r?.token && r?.expira) localStorage.setItem(CLAVE, JSON.stringify({ token: r.token, expira: r.expira, obtenido: Date.now() }));
    else localStorage.removeItem(CLAVE);
  } catch { /* sin almacenamiento */ }
}
export const olvidarToken = () => guardarToken(null);

// El token si aún no vence (con 1 min de margen); si no, null → se usa la llave pública
export function tokenVigente() {
  const s = leer();
  if (!s?.token || !s?.expira) return null;
  return s.expira * 1000 > Date.now() + 60_000 ? s.token : null;
}

export class ErrorSesion extends Error {
  constructor(codigo, segundos = null) { super(codigo); this.codigo = codigo; this.segundos = segundos; }
}

async function llamar(accion, datos) {
  let res;
  try {
    res = await fetch(URL_FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
      body: JSON.stringify({ accion, ...datos }),
    });
  } catch {
    throw new ErrorSesion('no_disponible');
  }
  const cuerpo = await res.json().catch(() => null);
  if (res.ok && cuerpo && (cuerpo.usuario || cuerpo.ok)) return cuerpo;
  // 401/403 con código propio = respuesta real del servidor; lo demás (404 sin desplegar, 5xx) = no disponible
  const codigo = cuerpo?.error;
  // 429 = demasiados intentos (Migración 13): trae los segundos que faltan
  if ([400, 401, 403, 429].includes(res.status) && codigo && codigo !== 'accion_desconocida') {
    throw new ErrorSesion(codigo, cuerpo?.segundos ?? null);
  }
  throw new ErrorSesion('no_disponible');
}

// ── Blindaje (paso 3, Migración 12): la BD ya no deja ver nada sin token ──
// El servidor lo dice en cada respuesta (`blindaje: true|false`); se recuerda en el aparato.
const CLAVE_BLINDAJE = 'territorial_blindaje';
export function anotarBlindaje(r) {
  if (typeof r?.blindaje !== 'boolean') return;
  try { localStorage.setItem(CLAVE_BLINDAJE, r.blindaje ? '1' : '0'); } catch { /* nada */ }
}
// Texto para "demasiados intentos" (en minutos, redondeado hacia arriba)
export const minutosBloqueo = (err) => Math.max(1, Math.ceil((Number(err?.segundos) || 900) / 60));

export const blindajeActivo = () => { try { return localStorage.getItem(CLAVE_BLINDAJE) === '1'; } catch { return false; } };
// Pregunta al servidor (sesiones viejas que nunca recibieron el aviso). null si no se pudo saber.
export async function consultarBlindaje() {
  try {
    const r = await llamar('estado', {});
    anotarBlindaje(r);
    return typeof r?.blindaje === 'boolean' ? r.blindaje : null;
  } catch {
    return null;
  }
}
// Token rechazado o vencido con la BD blindada → AuthContext cierra la sesión (evento del navegador)
export const EVENTO_SESION_INVALIDA = 'territorial:sesion-invalida';
export const avisarSesionInvalida = () => { try { window.dispatchEvent(new Event(EVENTO_SESION_INVALIDA)); } catch { /* nada */ } };

const conUsuario = (r) => { if (!r?.usuario) throw new ErrorSesion('no_disponible'); anotarBlindaje(r); return r; };

// Entrar con usuario y contraseña revisados en el servidor
export const entrarEnServidor = async (usuario, password) => conUsuario(await llamar('entrar', { usuario, password }));

// Cambiar la contraseña (la actual se revisa en el servidor; con la Migración 11 queda cifrada)
export const cambiarPasswordEnServidor = (usuarioId, actual, nueva) =>
  llamar('cambiar-password', { usuario_id: usuarioId, actual, nueva });

// Renueva el token (y trae rol/congregación al día) si ya pasó un día. null si no hace falta o no se puede.
export async function renovarSiToca() {
  const s = leer();
  if (!s?.token || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (Date.now() - (s.obtenido || 0) < RENOVAR_CADA_MS && s.expira * 1000 > Date.now() + 7 * 86400_000) return null;
  return conUsuario(await llamar('renovar', { token: s.token }));
}

// Renueva el token ya (al contestar "Sí, aquí sigo" en el aviso de inactividad). null si no hay token o internet.
export async function renovarAhora() {
  const s = leer();
  if (!s?.token || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  return conUsuario(await llamar('renovar', { token: s.token }));
}
