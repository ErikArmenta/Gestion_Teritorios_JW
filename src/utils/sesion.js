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
  constructor(codigo) { super(codigo); this.codigo = codigo; }
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
  if ((res.status === 401 || res.status === 403 || res.status === 400) && codigo && codigo !== 'accion_desconocida') {
    throw new ErrorSesion(codigo);
  }
  throw new ErrorSesion('no_disponible');
}

const conUsuario = (r) => { if (!r?.usuario) throw new ErrorSesion('no_disponible'); return r; };

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
