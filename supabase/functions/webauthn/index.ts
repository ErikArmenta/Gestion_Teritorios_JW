// Supabase Edge Function: webauthn
// Entrar con huella / Face ID (WebAuthn, passkeys). Migración 10 (MIGRACION_10_WEBAUTHN.sql).
// El servidor genera el "reto", guarda la llave pública y verifica cada firma: la huella nunca sale
// del teléfono. Las tablas webauthn_* tienen RLS sin políticas: solo esta función (service role) las toca.
//
// Acciones (POST { accion, ... }):
//   estado              → { ok: true } si la migración existe (la app muestra el botón solo así)
//   registro-opciones   { usuario_id, password }          → { reto_id, opciones }
//   registro-verificar  { reto_id, respuesta, dispositivo } → { credencial_id }
//   login-opciones      {}                                → { reto_id, opciones }
//   login-verificar     { reto_id, respuesta }            → { usuario }
//   quitar              { usuario_id, credencial_id }     → { ok: true }
//
// Desplegar: Supabase → Edge Functions → Deploy a new function → Via Editor → nombre "webauthn",
// pegar este archivo y DESACTIVAR "Verify JWT" (es para gente que todavía no inicia sesión).
// Secreto opcional WEBAUTHN_ORIGENES: orígenes permitidos separados por coma (por defecto, abajo).
// Las llaves quedan ligadas al dominio: si la app cambia de dominio hay que volver a activar la huella.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@13.3.3';
import { SignJWT, importJWK, type JWK } from 'npm:jose@5.10.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

// ── Token de sesión (mismo formato que la función `sesion`; si cambias uno, cambia el otro) ──
// Usa el secreto SESION_JWT_SECRET o SESION_JWK_PRIVADA. Sin ellos, o si Supabase no lo acepta, no hay token.
const DIAS_TOKEN = 30;
let llaveCache: { alg: 'HS256' | 'ES256'; kid?: string; firmar: CryptoKey | Uint8Array } | null | undefined;
async function llaveSesion() {
  if (llaveCache !== undefined) return llaveCache;
  try {
    const jwk = env('SESION_JWK_PRIVADA');
    const secreto = env('SESION_JWT_SECRET');
    if (jwk) {
      const privada = JSON.parse(jwk) as JWK;
      llaveCache = { alg: 'ES256', kid: privada.kid, firmar: (await importJWK({ ...privada, alg: 'ES256' }, 'ES256')) as CryptoKey };
    } else llaveCache = secreto ? { alg: 'HS256', firmar: new TextEncoder().encode(secreto) } : null;
  } catch (err) {
    console.error('Llave de sesión inválida', err);
    llaveCache = null;
  }
  return llaveCache;
}
// ¿BD blindada (Migración 12)? Igual que en `sesion`.
async function blindaje() {
  const { data, error } = await supabase.from('seguridad_config').select('valor').eq('clave', 'blindaje').maybeSingle();
  return !error && data?.valor === 'si';
}
let aceptadoHasta = 0;
// deno-lint-ignore no-explicit-any
async function tokenSesion(u: any, apikey: string) {
  const k = await llaveSesion();
  if (!k || !apikey) return {};
  const ahora = Math.floor(Date.now() / 1000);
  const expira = ahora + DIAS_TOKEN * 86400;
  const token = await new SignJWT({
    role: 'anon', usuario_id: u.id, congregacion_id: u.congregacion_id || null, app_rol: u.rol, grupo_id: u.grupo_id ?? null,
  })
    .setProtectedHeader(k.kid ? { alg: k.alg, kid: k.kid, typ: 'JWT' } : { alg: k.alg, typ: 'JWT' })
    .setIssuer('gestion-territorial').setIssuedAt(ahora).setExpirationTime(expira)
    .sign(k.firmar);
  if (Date.now() >= aceptadoHasta) {
    try {
      const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/congregaciones?select=id&limit=1`, {
        headers: { apikey, Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { console.error('Supabase rechazó el token de sesión', r.status); return {}; }
      aceptadoHasta = Date.now() + 10 * 60_000;
    } catch {
      return {};
    }
  }
  return { token, expira };
}

const ORIGENES = (env('WEBAUTHN_ORIGENES') ||
  'https://gestion-teritorios-jw.vercel.app,http://localhost:5173,http://localhost:4173')
  .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
const RP_NOMBRE = 'Gestión Territorial';
const MINUTOS_RETO = 5;

// base64url <-> bytes (la llave pública se guarda como texto)
const aB64 = (u8: Uint8Array) => {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const deB64 = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

class Fallo extends Error {
  codigo: string;
  status: number;
  constructor(codigo: string, status = 400) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
  }
}

const activo = (u: { activo?: boolean | null }) => u.activo !== false;

// ¿La contraseña es correcta? Con la Migración 11 se revisa cifrada (verificar_password); sin ella, como
// siempre. (Misma lógica que en `sesion`; si cambias una, cambia la otra.)
async function passwordCorrecta(id: number, password: string) {
  const { data, error } = await supabase.rpc('verificar_password', { p_password: password, p_usuario: null, p_id: id });
  if (!error) return data != null;
  if (!/PGRST202|42883|Could not find the function/i.test(`${error.code} ${error.message}`)) throw error;
  const { data: u, error: e2 } = await supabase.from('app_usuarios').select('id').eq('id', id).eq('password', password).maybeSingle();
  if (e2) throw e2;
  return !!u;
}

async function guardarReto(reto: string, tipo: 'registro' | 'login', usuario_id: number | null) {
  // Limpieza de retos vencidos (no importa si falla)
  await supabase.from('webauthn_retos').delete().lt('expira_en', new Date().toISOString());
  const expira_en = new Date(Date.now() + MINUTOS_RETO * 60_000).toISOString();
  const { data, error } = await supabase.from('webauthn_retos')
    .insert({ reto, tipo, usuario_id, expira_en }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

// Cada reto sirve una sola vez: se borra al leerlo
async function tomarReto(id: string, tipo: 'registro' | 'login') {
  if (!id) throw new Fallo('reto_invalido');
  const { data } = await supabase.from('webauthn_retos').delete().eq('id', id).eq('tipo', tipo).select('*');
  const reto = data?.[0];
  if (!reto) throw new Fallo('reto_invalido');
  if (new Date(reto.expira_en).getTime() < Date.now()) throw new Fallo('reto_vencido');
  return reto as { reto: string; usuario_id: number | null };
}

// deno-lint-ignore no-explicit-any
async function atender(accion: string, d: any, origen: string, apikey: string) {
  const rpID = new URL(origen).hostname;

  if (accion === 'estado') {
    const { error } = await supabase.from('webauthn_credenciales').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw new Fallo('sin_migracion', 503);
    return { ok: true };
  }

  if (accion === 'registro-opciones') {
    // Activar la huella pide la contraseña otra vez: así nadie la activa en una cuenta ajena
    const usuarioId = Number(d.usuario_id);
    if (!usuarioId || typeof d.password !== 'string' || !d.password) throw new Fallo('credenciales');
    if (!(await passwordCorrecta(usuarioId, d.password))) throw new Fallo('credenciales', 401);
    const { data: u } = await supabase.from('app_usuarios')
      .select('id, usuario, nombre, activo').eq('id', usuarioId).maybeSingle();
    if (!u) throw new Fallo('credenciales', 401);
    if (!activo(u)) throw new Fallo('desactivada', 403);

    const { data: previas } = await supabase.from('webauthn_credenciales')
      .select('credencial_id, transportes').eq('usuario_id', u.id);
    const opciones = await generateRegistrationOptions({
      rpName: RP_NOMBRE,
      rpID,
      userName: u.usuario,
      userDisplayName: u.nombre || u.usuario,
      userID: new TextEncoder().encode(`usuario-${u.id}`),
      attestationType: 'none',
      // No volver a registrar el mismo teléfono (el navegador avisa que ya está)
      excludeCredentials: (previas ?? []).map((c) => ({ id: c.credencial_id, transports: c.transportes ?? undefined })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // la huella / Face ID del propio aparato
        residentKey: 'required', // passkey: al entrar no hay que escribir el usuario
        userVerification: 'required',
      },
    });
    return { reto_id: await guardarReto(opciones.challenge, 'registro', u.id), opciones };
  }

  if (accion === 'registro-verificar') {
    const reto = await tomarReto(d.reto_id, 'registro');
    const v = await verifyRegistrationResponse({
      response: d.respuesta,
      expectedChallenge: reto.reto,
      expectedOrigin: ORIGENES,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!v.verified) throw new Fallo('no_verificado', 401);
    const { credential } = v.registrationInfo;
    const { error } = await supabase.from('webauthn_credenciales').insert({
      usuario_id: reto.usuario_id,
      credencial_id: credential.id,
      llave_publica: aB64(credential.publicKey),
      contador: credential.counter,
      transportes: credential.transports ?? null,
      dispositivo: typeof d.dispositivo === 'string' ? d.dispositivo.slice(0, 80) : null,
    });
    if (error) throw error;
    return { credencial_id: credential.id };
  }

  if (accion === 'login-opciones') {
    const opciones = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    return { reto_id: await guardarReto(opciones.challenge, 'login', null), opciones };
  }

  if (accion === 'login-verificar') {
    const reto = await tomarReto(d.reto_id, 'login');
    const idCred = d.respuesta?.id;
    if (typeof idCred !== 'string') throw new Fallo('no_verificado', 401);
    const { data: cred } = await supabase.from('webauthn_credenciales')
      .select('*').eq('credencial_id', idCred).maybeSingle();
    if (!cred) throw new Fallo('sin_huella', 404);

    const v = await verifyAuthenticationResponse({
      response: d.respuesta,
      expectedChallenge: reto.reto,
      expectedOrigin: ORIGENES,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credencial_id,
        publicKey: deB64(cred.llave_publica),
        counter: Number(cred.contador) || 0,
        transports: cred.transportes ?? undefined,
      },
    });
    if (!v.verified) throw new Fallo('no_verificado', 401);
    await supabase.from('webauthn_credenciales')
      .update({ contador: v.authenticationInfo.newCounter, usado_en: new Date().toISOString() })
      .eq('id', cred.id);

    const { data: u } = await supabase.from('app_usuarios')
      .select('*').eq('id', cred.usuario_id).maybeSingle();
    if (!u) throw new Fallo('sin_huella', 404);
    if (!activo(u)) throw new Fallo('desactivada', 403);
    let congregacion_nombre = null;
    if (u.congregacion_id) {
      const { data: c } = await supabase.from('congregaciones').select('nombre').eq('id', u.congregacion_id).maybeSingle();
      congregacion_nombre = c?.nombre ?? null;
    }
    return {
      usuario: {
        id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, foto_url: u.foto_url || null,
        congregacion_id: u.congregacion_id || null, congregacion_nombre,
      },
      ...(await tokenSesion(u, apikey)),
      blindaje: await blindaje(),
    };
  }

  if (accion === 'quitar') {
    // El id de la credencial es largo y aleatorio, y solo lo conoce el aparato que la registró
    if (typeof d.credencial_id !== 'string' || !Number(d.usuario_id)) throw new Fallo('credenciales');
    await supabase.from('webauthn_credenciales').delete()
      .eq('credencial_id', d.credencial_id).eq('usuario_id', Number(d.usuario_id));
    return { ok: true };
  }

  throw new Fallo('accion_desconocida');
}

Deno.serve(async (req) => {
  const origen = (req.headers.get('origin') ?? '').replace(/\/$/, '');
  const permitido = ORIGENES.includes(origen);
  const cors = {
    'Access-Control-Allow-Origin': permitido ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!permitido) return Response.json({ error: 'origen' }, { status: 403, headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'metodo' }, { status: 405, headers: cors });

  try {
    const d = await req.json().catch(() => ({}));
    // La llave pública con que llega la app sirve para probar el token de sesión contra la base de datos
    const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY');
    return Response.json(await atender(String(d.accion ?? ''), d, origen, apikey), { headers: cors });
  } catch (err) {
    if (err instanceof Fallo) return Response.json({ error: err.codigo }, { status: err.status, headers: cors });
    console.error(err);
    // Errores de la librería al verificar (firma, origen, reto) = no verificado
    const msg = String((err as Error)?.message ?? err);
    const status = /verif|challenge|origin|rpid|signature|counter/i.test(msg) ? 401 : 500;
    return Response.json({ error: status === 401 ? 'no_verificado' : 'servidor' }, { status, headers: cors });
  }
});
