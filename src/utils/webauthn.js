// Entrar con huella / Face ID (WebAuthn, passkeys) — Migración 10.
// Toda la verificación la hace la Edge Function `webauthn` (supabase/functions/webauthn); aquí solo
// se habla con ella y con el lector del teléfono. Si la migración o la función no existen, `estadoBiometria`
// responde false y la app no muestra nada.
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { t } from '../i18n';

const URL_FUNCION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn`;
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY;

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const MENSAJES = {
  credenciales: 'La contraseña no es correcta',
  bloqueado: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  desactivada: 'Esta cuenta ha sido desactivada por un administrador',
  sin_huella: 'Esta huella ya no está registrada. Entra con tu contraseña y vuelve a activarla en Mi Perfil.',
  reto_vencido: 'Se tardó demasiado. Inténtalo de nuevo.',
  reto_invalido: 'Se tardó demasiado. Inténtalo de nuevo.',
  no_verificado: 'No se pudo verificar la huella. Inténtalo de nuevo.',
  sin_migracion: 'La entrada con huella aún no está configurada en el servidor',
  no_configurado: 'La entrada con huella aún no está configurada en el servidor',
  origen: 'La entrada con huella no está permitida en esta dirección',
};

class ErrorBiometria extends Error {
  constructor(codigo) {
    super(t(MENSAJES[codigo] || 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'));
    this.codigo = codigo;
  }
}

async function llamar(accion, datos = {}) {
  let res;
  try {
    res = await fetch(URL_FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
      body: JSON.stringify({ accion, ...datos }),
    });
  } catch {
    throw new ErrorBiometria('red');
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorBiometria(cuerpo?.error || (res.status === 404 ? 'no_configurado' : 'servidor'));
  return cuerpo;
}

// El usuario canceló o el teléfono no tiene una huella para esta app
const errorDelLector = (err, alEntrar) => {
  if (err instanceof ErrorBiometria) return err;
  const nombre = err?.name || err?.cause?.name;
  if (nombre === 'InvalidStateError') return new Error(t('Este dispositivo ya tiene la huella activada'));
  if (nombre === 'NotAllowedError' || nombre === 'AbortError') {
    return new Error(alEntrar
      ? t('No se usó la huella. Si aún no la activas, entra con tu contraseña y actívala en Mi Perfil.')
      : t('Se canceló la activación'));
  }
  return new Error(t('Este dispositivo no permite usar la huella aquí'));
};

// ── ¿Se puede usar en este aparato? ──
export async function lectorDisponible() {
  if (!browserSupportsWebAuthn()) return false;
  try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
}

// ¿El servidor ya tiene la Migración 10 y la función? (se recuerda durante la sesión del navegador)
export async function estadoBiometria() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const guardado = (() => { try { return sessionStorage.getItem('biometria_estado'); } catch { return null; } })();
  if (guardado) return guardado === '1';
  let ok;
  try { ok = !!(await llamar('estado'))?.ok; } catch (err) {
    // Sin respuesta (microcorte, o se cambió de página a media petición): no se recuerda, se vuelve a preguntar
    if (err?.codigo === 'red') return false;
    ok = false;
  }
  try { sessionStorage.setItem('biometria_estado', ok ? '1' : '0'); } catch { /* nada */ }
  return ok;
}

// ── Ícono que el usuario eligió para el botón: 'huella' | 'rostro' ──
export function iconoBiometria() {
  const v = leer('biometria_icono');
  if (v === 'huella' || v === 'rostro') return v;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'rostro' : 'huella';
}
export const guardarIconoBiometria = (v) => escribir('biometria_icono', v);

// ── Marca local: este aparato tiene la huella de este usuario ──
const llaveLocal = (usuarioId) => `biometria:${usuarioId}`;
export const credencialLocal = (usuarioId) => leer(llaveLocal(usuarioId));

const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : t('Dispositivo');
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /CriOS|Chrome/.test(ua) ? 'Chrome'
    : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return nav ? `${so} · ${nav}` : so;
};

// ── Activar (ya con sesión; pide la contraseña otra vez) ──
export async function activarBiometria(usuarioId, password) {
  const { reto_id, opciones } = await llamar('registro-opciones', { usuario_id: usuarioId, password });
  let respuesta;
  try {
    respuesta = await startRegistration({ optionsJSON: opciones });
  } catch (err) {
    throw errorDelLector(err, false);
  }
  const { credencial_id } = await llamar('registro-verificar', { reto_id, respuesta, dispositivo: nombreDispositivo() });
  escribir(llaveLocal(usuarioId), credencial_id);
  return credencial_id;
}

// ── Entrar: el teléfono elige la cuenta (passkey), el servidor verifica y devuelve el usuario ──
export async function entrarConBiometria() {
  const { reto_id, opciones } = await llamar('login-opciones');
  let respuesta;
  try {
    respuesta = await startAuthentication({ optionsJSON: opciones });
  } catch (err) {
    throw errorDelLector(err, true);
  }
  try {
    const r = await llamar('login-verificar', { reto_id, respuesta }); // { usuario, token?, expira? }
    escribir(llaveLocal(r.usuario.id), respuesta.id);
    return r;
  } catch (err) {
    if (err?.codigo === 'sin_huella') avisarLlaveBorrada(respuesta.id);
    throw err;
  }
}

// Le dice al teléfono que esa llave ya no sirve para que la quite de su lista (Chrome 132+; si no, nada)
function avisarLlaveBorrada(credentialId) {
  try {
    window.PublicKeyCredential?.signalUnknownCredential?.({ rpId: location.hostname, credentialId })?.catch?.(() => {});
  } catch { /* no soportado */ }
}

// ── Quitar la huella de este aparato ──
export async function quitarBiometria(usuarioId) {
  const credencial_id = credencialLocal(usuarioId);
  if (credencial_id) {
    await llamar('quitar', { usuario_id: usuarioId, credencial_id });
    avisarLlaveBorrada(credencial_id);
  }
  escribir(llaveLocal(usuarioId), null);
}
