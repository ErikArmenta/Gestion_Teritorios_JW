// Supabase Edge Function: sesion
// Paso 1 del blindaje: el login se revisa en el servidor y la app recibe un TOKEN FIRMADO con quién es
// (usuario_id, congregacion_id, rol). Hoy las tablas siguen abiertas como siempre (el token usa el rol
// `anon` de Postgres, el mismo de la llave pública), así que nada cambia; en el paso 3 los permisos de
// cada tabla leerán ese token (`auth.jwt() ->> 'congregacion_id'`) y la llave pública sola ya no verá nada.
//
// Acciones (POST { accion, ... }):
//   entrar            { usuario, password }          → { usuario, token?, expira? }
//   renovar           { token }                      → { usuario, token, expira }  (403 si la cuenta se desactivó)
//   cambiar-password  { usuario_id, actual, nueva }  → { ok: true }  (nueva: mínimo 6)
// Demasiados intentos fallidos (Migración 13) → 429 { error: "bloqueado", segundos }
//   estado            {}                             → { ok: true, blindaje }  (¿Migración 12 activa?)
// Las respuestas con usuario llevan `blindaje: true|false`.
// Contraseñas: con la Migración 11 se revisan cifradas (verificar_password); sin ella, como siempre.
//
// Firma (Edge Functions → Secrets), UNA de las dos (pasos en docs/SESION_SEGURA.md):
//   SESION_JWT_SECRET  = el "Legacy JWT secret" del proyecto (HS256)
//   SESION_JWK_PRIVADA = llave privada ES256 propia (JWK en JSON, con "kid"), importada en JWT Keys
// Sin ninguna, o si Supabase no acepta el token, la función responde sin token y la app sigue como hoy.
//
// Desplegar: Edge Functions → Deploy a new function → Via Editor → nombre "sesion" → pegar este archivo
// → DESACTIVAR "Verify JWT" (la usan personas que todavía no inician sesión) → Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT, importJWK, jwtVerify, type JWK } from 'npm:jose@5.10.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const supabase = createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'));

const DIAS_TOKEN = 30; // la app lo renueva al abrirse (una vez al día) mientras haya internet
const EMISOR = 'gestion-territorial';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class Fallo extends Error {
  codigo: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(codigo: string, status = 400, extra: Record<string, unknown> = {}) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
    this.extra = extra;
  }
}
// ── Límite de intentos (Migración 13, tabla login_intentos). Sin la tabla no se limita nada. ──
// 5 fallos por usuario / 20 por IP en 15 minutos → bloqueado 15 minutos. (Igual en `sesion` y `webauthn`.)
const LIMITES: Record<string, number> = { u: 5, id: 5, ip: 20 };
const VENTANA_MS = 15 * 60_000;
let sinTablaIntentos = false;
const faltaTabla = (e: { code?: string; message?: string }) => /42P01|PGRST205|does not exist|Could not find the table/i.test(`${e.code} ${e.message}`);
async function revisarBloqueo(claves: string[]) {
  if (sinTablaIntentos) return;
  const { data, error } = await supabase.from('login_intentos').select('clave, bloqueado_hasta').in('clave', claves);
  if (error) { if (faltaTabla(error)) sinTablaIntentos = true; return; }
  const hasta = Math.max(0, ...(data ?? []).map((r) => (r.bloqueado_hasta ? new Date(r.bloqueado_hasta).getTime() : 0)));
  if (hasta > Date.now()) throw new Fallo('bloqueado', 429, { segundos: Math.ceil((hasta - Date.now()) / 1000) });
}
async function anotarFallo(claves: string[]) {
  if (sinTablaIntentos) return;
  const ahora = Date.now();
  const { data, error } = await supabase.from('login_intentos').select('*').in('clave', claves);
  if (error) { if (faltaTabla(error)) sinTablaIntentos = true; return; }
  const filas = claves.map((clave) => {
    const r = (data ?? []).find((x) => x.clave === clave);
    const nueva = !r || ahora - new Date(r.primer_fallo).getTime() > VENTANA_MS;
    const fallos = nueva ? 1 : Number(r.fallos) + 1;
    const limite = LIMITES[clave.split(':')[0]] ?? 5;
    return {
      clave, fallos,
      primer_fallo: nueva ? new Date(ahora).toISOString() : r.primer_fallo,
      bloqueado_hasta: fallos >= limite ? new Date(ahora + VENTANA_MS).toISOString() : (nueva ? null : r.bloqueado_hasta),
    };
  });
  await supabase.from('login_intentos').upsert(filas, { onConflict: 'clave' });
}
async function limpiarIntentos(claves: string[]) {
  if (!sinTablaIntentos) await supabase.from('login_intentos').delete().in('clave', claves);
}
const ipDe = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  || req.headers.get('cf-connecting-ip') || 'desconocida';


// ── Llave de firma ──
type Llave = { alg: 'HS256' | 'ES256'; kid?: string; firmar: CryptoKey | Uint8Array; verificar: CryptoKey | Uint8Array };
let llaveCache: Llave | null | undefined;
async function llave(): Promise<Llave | null> {
  if (llaveCache !== undefined) return llaveCache;
  const jwk = env('SESION_JWK_PRIVADA');
  const secreto = env('SESION_JWT_SECRET');
  try {
    if (jwk) {
      const privada = JSON.parse(jwk) as JWK;
      const { d: _d, key_ops: _k, ...publica } = privada;
      llaveCache = {
        alg: 'ES256',
        kid: privada.kid,
        firmar: (await importJWK({ ...privada, alg: 'ES256' }, 'ES256')) as CryptoKey,
        verificar: (await importJWK({ ...publica, alg: 'ES256' }, 'ES256')) as CryptoKey,
      };
    } else if (secreto) {
      const bytes = new TextEncoder().encode(secreto);
      llaveCache = { alg: 'HS256', firmar: bytes, verificar: bytes };
    } else {
      llaveCache = null;
    }
  } catch (err) {
    console.error('Llave de sesión inválida', err);
    llaveCache = null;
  }
  return llaveCache;
}

type Usuario = {
  id: number; nombre: string; usuario: string; rol: string; foto_url: string | null;
  congregacion_id: string | null; congregacion_nombre: string | null; grupo_id?: number | null;
};

async function firmar(u: Usuario) {
  const k = await llave();
  if (!k) return null;
  const ahora = Math.floor(Date.now() / 1000);
  const exp = ahora + DIAS_TOKEN * 86400;
  const token = await new SignJWT({
    role: 'anon', // mismo rol de Postgres que la llave pública: hoy no cambia ningún permiso
    usuario_id: u.id,
    congregacion_id: u.congregacion_id,
    app_rol: u.rol,
    grupo_id: u.grupo_id ?? null,
  })
    .setProtectedHeader(k.kid ? { alg: k.alg, kid: k.kid, typ: 'JWT' } : { alg: k.alg, typ: 'JWT' })
    .setIssuer(EMISOR)
    .setIssuedAt(ahora)
    .setExpirationTime(exp)
    .sign(k.firmar);
  return { token, expira: exp };
}

// ¿Supabase acepta nuestros tokens? Se prueba con una lectura real; si no, NO se entrega token
// (si se entregara uno que la base de datos rechaza, la app dejaría de cargar datos).
let aceptadoHasta = 0;
async function supabaseAcepta(token: string, apikey: string) {
  if (Date.now() < aceptadoHasta) return true;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/congregaciones?select=id&limit=1`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    if (r.ok) { aceptadoHasta = Date.now() + 10 * 60_000; return true; }
    console.error('Supabase rechazó el token de sesión', r.status, (await r.text()).slice(0, 300));
  } catch (err) {
    console.error('No se pudo probar el token de sesión', err);
  }
  return false;
}

// ¿La contraseña es correcta? Devuelve el id o null. Con la Migración 11 se revisa la versión cifrada
// (función verificar_password en la BD); sin ella, la comparación de siempre.
// (Misma función en `webauthn`; si cambias una, cambia la otra.)
async function passwordCorrecta(filtro: { id?: number; usuario?: string }, password: string): Promise<number | null> {
  if (!password) return null;
  const { data, error } = await supabase.rpc('verificar_password', {
    p_password: password, p_usuario: filtro.usuario ?? null, p_id: filtro.id ?? null,
  });
  if (!error) return data == null ? null : Number(data);
  if (!/PGRST202|42883|Could not find the function/i.test(`${error.code} ${error.message}`)) throw error;
  let q = supabase.from('app_usuarios').select('id').eq('password', password);
  q = filtro.id != null ? q.eq('id', filtro.id) : q.eq('usuario', filtro.usuario ?? '');
  const { data: u, error: e2 } = await q.maybeSingle();
  if (e2) throw e2;
  return u ? Number(u.id) : null;
}

async function cargarUsuario(filtro: { id: number }) {
  const q = supabase.from('app_usuarios').select('*').eq('id', filtro.id);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new Fallo('credenciales', 401);
  if (data.activo === false) throw new Fallo('desactivada', 403);
  let congregacion_nombre = null;
  if (data.congregacion_id) {
    const { data: c } = await supabase.from('congregaciones').select('nombre').eq('id', data.congregacion_id).maybeSingle();
    congregacion_nombre = c?.nombre ?? null;
  }
  // Los mismos campos que siempre guardó la app en la sesión (nunca la contraseña)
  const usuario: Usuario = {
    id: data.id, nombre: data.nombre, usuario: data.usuario, rol: data.rol, foto_url: data.foto_url || null,
    congregacion_id: data.congregacion_id || null, congregacion_nombre, grupo_id: data.grupo_id ?? null,
  };
  return usuario;
}

// ¿La BD ya está blindada (Migración 12)? La app lo usa para no dejar sesiones sin token.
let blindajeCache = { valor: false, hasta: 0 };
async function blindaje() {
  if (Date.now() < blindajeCache.hasta) return blindajeCache.valor;
  const { data, error } = await supabase.from('seguridad_config').select('valor').eq('clave', 'blindaje').maybeSingle();
  const valor = !error && data?.valor === 'si';
  blindajeCache = { valor, hasta: Date.now() + 60_000 };
  return valor;
}

async function conToken(u: Usuario, apikey: string) {
  const { grupo_id: _g, ...usuario } = u;
  const b = await blindaje();
  const f = await firmar(u);
  if (!f || !apikey || !(await supabaseAcepta(f.token, apikey))) return { usuario, blindaje: b };
  return { usuario, token: f.token, expira: f.expira, blindaje: b };
}

// deno-lint-ignore no-explicit-any
async function atender(accion: string, d: any, apikey: string, ip: string) {
  if (accion === 'estado') return { ok: true, blindaje: await blindaje() };

  if (accion === 'entrar') {
    if (typeof d.usuario !== 'string' || typeof d.password !== 'string' || !d.usuario || !d.password) {
      throw new Fallo('credenciales', 401);
    }
    const claves = [`u:${d.usuario.trim().toLowerCase()}`, `ip:${ip}`];
    await revisarBloqueo(claves);
    const id = await passwordCorrecta({ usuario: d.usuario }, d.password);
    if (!id) { await anotarFallo(claves); throw new Fallo('credenciales', 401); }
    await limpiarIntentos([claves[0]]);
    return conToken(await cargarUsuario({ id }), apikey);
  }

  if (accion === 'cambiar-password') {
    // Saber la contraseña actual es la prueba de identidad (no hace falta token)
    const usuarioId = Number(d.usuario_id);
    if (!usuarioId || typeof d.actual !== 'string' || typeof d.nueva !== 'string') throw new Fallo('credenciales', 401);
    if (d.nueva.length < 6) throw new Fallo('muy_corta', 400);
    const claves = [`id:${usuarioId}`, `ip:${ip}`];
    await revisarBloqueo(claves);
    if (!(await passwordCorrecta({ id: usuarioId }, d.actual))) { await anotarFallo(claves); throw new Fallo('credenciales', 401); }
    await limpiarIntentos([claves[0]]);
    // El disparador de la Migración 11 la cifra (y en la fase 2 no deja el texto plano)
    const { error } = await supabase.from('app_usuarios').update({ password: d.nueva }).eq('id', usuarioId);
    if (error) throw error;
    return { ok: true };
  }

  if (accion === 'renovar') {
    const k = await llave();
    if (!k || typeof d.token !== 'string') throw new Fallo('sin_token', 400);
    let id: number;
    try {
      const { payload } = await jwtVerify(d.token, k.verificar, { issuer: EMISOR, algorithms: [k.alg] });
      id = Number(payload.usuario_id);
    } catch {
      throw new Fallo('token_invalido', 401);
    }
    if (!id) throw new Fallo('token_invalido', 401);
    return conToken(await cargarUsuario({ id }), apikey);
  }

  throw new Fallo('accion_desconocida');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'metodo' }, { status: 405, headers: cors });
  try {
    const d = await req.json().catch(() => ({}));
    // La llave pública con que llega la app sirve para probar el token contra la base de datos
    const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY');
    return Response.json(await atender(String(d.accion ?? ''), d, apikey, ipDe(req)), { headers: cors });
  } catch (err) {
    if (err instanceof Fallo) return Response.json({ error: err.codigo, ...err.extra }, { status: err.status, headers: cors });
    console.error(err);
    return Response.json({ error: 'servidor' }, { status: 500, headers: cors });
  }
});
