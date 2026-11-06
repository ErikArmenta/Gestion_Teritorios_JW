// Supabase Edge Function: respaldo
// Respaldo automático de las tablas de Gestión Territorial en el bucket PRIVADO `respaldos` (Migración 14).
// Lo dispara pg_cron cada semana (MIGRACION_14B) con el encabezado x-respaldo-secreto, o un Super Admin
// desde Backup ("Respaldar ahora"). Se guardan los últimos 12. Un Super Admin los lista y los descarga
// (link firmado de 2 minutos). Pasos: docs/RESPALDOS.md
//
// Acciones (POST { accion, ... }):
//   crear     (secreto o token de Super Admin) → { nombre, tamano, filas }
//   listar    { token }                         → { respaldos: [{ nombre, tamano, fecha }] }
//   descargar { token, nombre }                 → { url }
//
// Secretos: RESPALDO_SECRETO (lo usa pg_cron) y la misma llave de sesión que `sesion`
// (SESION_JWT_SECRET o SESION_JWK_PRIVADA) para revisar el token. Desplegar con "Verify JWT" desactivado.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importJWK, jwtVerify, type JWK } from 'npm:jose@5.10.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const BUCKET = 'respaldos';
const CONSERVAR = 12;
// Solo tablas de esta app (el proyecto lo comparten otras apps)
const TABLAS = [
  'congregaciones', 'app_usuarios', 'grupos_predicacion', 'territorios', 'territorio_manzanas', 'casas',
  'historial_visitas', 'territorio_asignaciones', 'territorio_compartidos', 'territorio_trabajos',
  'exhibidores', 'exhibidor_turnos', 'alertas_panico', 'notificaciones', 'registros_servicio', 'informes_servicio',
];
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

// ── Token de sesión (mismo formato que la función `sesion`) ──
async function llaveVerificar() {
  const jwk = env('SESION_JWK_PRIVADA');
  if (jwk) {
    const { d: _d, key_ops: _k, ...publica } = JSON.parse(jwk) as JWK;
    return { alg: 'ES256', llave: await importJWK({ ...publica, alg: 'ES256' }, 'ES256') };
  }
  const secreto = env('SESION_JWT_SECRET');
  return secreto ? { alg: 'HS256', llave: new TextEncoder().encode(secreto) } : null;
}
async function superAdmin(token: unknown) {
  const k = await llaveVerificar();
  if (!k || typeof token !== 'string') throw new Fallo('sin_permiso', 403);
  let id: number;
  try {
    const { payload } = await jwtVerify(token, k.llave, { issuer: 'gestion-territorial', algorithms: [k.alg] });
    id = Number(payload.usuario_id);
  } catch {
    throw new Fallo('sin_permiso', 403);
  }
  const { data } = await supabase.from('app_usuarios').select('rol, activo').eq('id', id).maybeSingle();
  if (!data || data.activo === false || data.rol !== 'Super Admin') throw new Fallo('sin_permiso', 403);
}

async function todasLasFilas(tabla: string) {
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').order('id').range(desde, desde + 999);
    if (error) {
      // Tabla opcional que no existe en este proyecto → se omite
      if (/42P01|PGRST205|does not exist|Could not find the table/i.test(`${error.code} ${error.message}`)) return null;
      throw error;
    }
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

async function crear() {
  const datos: Record<string, unknown[]> = {};
  const conteo: Record<string, number> = {};
  for (const t of TABLAS) {
    const filas = await todasLasFilas(t);
    if (filas === null) continue;
    datos[t] = filas;
    conteo[t] = filas.length;
  }
  const ahora = new Date();
  const json = JSON.stringify({ metadata: { app: 'Gestión Territorial', version: 2, fecha: ahora.toISOString(), filas: conteo }, datos });
  const comprimido = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const nombre = `respaldo_${ahora.toISOString().slice(0, 16).replace(/[-:T]/g, (c) => (c === 'T' ? '_' : c === ':' ? '' : '-'))}.json.gz`;
  const { error } = await supabase.storage.from(BUCKET).upload(nombre, comprimido, { contentType: 'application/gzip', upsert: true });
  if (error) throw error;
  // Conservar solo los últimos 12
  const { data: lista } = await supabase.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  const viejos = (lista ?? []).filter((f) => f.name.startsWith('respaldo_')).slice(CONSERVAR).map((f) => f.name);
  if (viejos.length) await supabase.storage.from(BUCKET).remove(viejos);
  return { nombre, tamano: comprimido.byteLength, filas: conteo };
}

// deno-lint-ignore no-explicit-any
async function atender(accion: string, d: any, secreto: string | null) {
  if (accion === 'crear') {
    const conSecreto = !!env('RESPALDO_SECRETO') && secreto === env('RESPALDO_SECRETO');
    if (!conSecreto) await superAdmin(d.token);
    return crear();
  }
  if (accion === 'listar') {
    await superAdmin(d.token);
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
    if (error) throw error;
    return {
      respaldos: (data ?? []).filter((f) => f.name.startsWith('respaldo_'))
        .map((f) => ({ nombre: f.name, tamano: f.metadata?.size ?? null, fecha: f.created_at })),
    };
  }
  if (accion === 'descargar') {
    await superAdmin(d.token);
    if (typeof d.nombre !== 'string' || !/^respaldo_[\w-]+\.json\.gz$/.test(d.nombre)) throw new Fallo('nombre');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.nombre, 120, { download: d.nombre });
    if (error) throw error;
    return { url: data.signedUrl };
  }
  throw new Fallo('accion_desconocida');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'metodo' }, { status: 405, headers: cors });
  try {
    const d = await req.json().catch(() => ({}));
    return Response.json(await atender(String(d.accion ?? ''), d, req.headers.get('x-respaldo-secreto')), { headers: cors });
  } catch (err) {
    if (err instanceof Fallo) return Response.json({ error: err.codigo }, { status: err.status, headers: cors });
    console.error(err);
    return Response.json({ error: 'servidor' }, { status: 500, headers: cors });
  }
});
