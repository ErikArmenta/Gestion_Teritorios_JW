// Supabase Edge Function: sesion
// Paso 1 del blindaje: el login se revisa en el servidor y la app recibe un TOKEN FIRMADO con quién es
// (usuario_id, congregacion_id, rol). Hoy las tablas siguen abiertas como siempre (el token usa el rol
// `anon` de Postgres, el mismo de la llave pública), así que nada cambia; en el paso 3 los permisos de
// cada tabla leerán ese token (`auth.jwt() ->> 'congregacion_id'`) y la llave pública sola ya no verá nada.
//
// Acciones (POST { accion, ... }):
//   entrar   { usuario, password } → { usuario, token?, expira? }
//   renovar  { token }             → { usuario, token, expira }  (403 si la cuenta se desactivó)
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
  constructor(codigo: string, status = 400) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
  }
}

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

async function cargarUsuario(filtro: { id?: number; usuario?: string; password?: string }) {
  let q = supabase.from('app_usuarios').select('*');
  if (filtro.id != null) q = q.eq('id', filtro.id);
  if (filtro.usuario != null) q = q.eq('usuario', filtro.usuario).eq('password', filtro.password ?? '');
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

async function conToken(u: Usuario, apikey: string) {
  const { grupo_id: _g, ...usuario } = u;
  const f = await firmar(u);
  if (!f || !apikey || !(await supabaseAcepta(f.token, apikey))) return { usuario };
  return { usuario, token: f.token, expira: f.expira };
}

// deno-lint-ignore no-explicit-any
async function atender(accion: string, d: any, apikey: string) {
  if (accion === 'entrar') {
    if (typeof d.usuario !== 'string' || typeof d.password !== 'string' || !d.usuario || !d.password) {
      throw new Fallo('credenciales', 401);
    }
    return conToken(await cargarUsuario({ usuario: d.usuario, password: d.password }), apikey);
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
    return Response.json(await atender(String(d.accion ?? ''), d, apikey), { headers: cors });
  } catch (err) {
    if (err instanceof Fallo) return Response.json({ error: err.codigo }, { status: err.status, headers: cors });
    console.error(err);
    return Response.json({ error: 'servidor' }, { status: 500, headers: cors });
  }
});
