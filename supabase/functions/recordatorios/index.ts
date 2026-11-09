// Supabase Edge Function: recordatorios
// La llama pg_cron todos los días a las 7 p. m. (hora del centro de México; MIGRACION_16B) y decide qué toca:
//   1. Informe: el último día del mes y los días 1 y 2 → a quien no ha enviado su informe de ese mes.
//   2. Exhibidor: un día antes del turno → a quien le toca (si no está rechazado ni cancelado).
//   3. Territorios: los lunes → a ancianos y admins, los territorios con más de 4 meses sin trabajarse.
// Nunca repite: cada aviso se anota en recordatorios_enviados (Migración 16). Push por OneSignal (mismos secretos
// que `enviar-push`). Un Super Admin puede pedir la vista previa (quién lo recibiría hoy) sin mandar nada.
//
// Acciones (POST { accion, hoy? }):
//   enviar        (encabezado x-cron-secreto = RECORDATORIOS_SECRETO o RESPALDO_SECRETO) → resumen
//   vista_previa  { token } de Super Admin → resumen sin mandar nada
// Secretos: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, APP_URL, RESPALDO_SECRETO (o RECORDATORIOS_SECRETO),
// y la llave de sesión (SESION_JWT_SECRET o SESION_JWK_PRIVADA) para la vista previa. "Verify JWT" desactivado.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importJWK, jwtVerify, type JWK } from 'npm:jose@5.10.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const ZONA = 'America/Mexico_City';
const MESES_SIN_TRABAJAR = 4;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

class Fallo extends Error {
  codigo: string;
  status: number;
  constructor(codigo: string, status = 400) { super(codigo); this.codigo = codigo; this.status = status; }
}

// ── Fechas (texto 'YYYY-MM-DD', en la hora de México) ──
const hoyMexico = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fechaD = (s: string) => new Date(`${s}T12:00:00Z`);
const txt = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (s: string, n: number) => { const d = fechaD(s); d.setUTCDate(d.getUTCDate() + n); return txt(d); };
const mesDe = (s: string) => `${s.slice(0, 7)}-01`;
const mesAnterior = (s: string) => { const d = fechaD(mesDe(s)); d.setUTCMonth(d.getUTCMonth() - 1); return txt(d); };
const esUltimoDia = (s: string) => masDias(s, 1).slice(8) === '01';
const diaSemana = (s: string) => fechaD(s).getUTCDay(); // 1 = lunes
// Semana ISO ('2026-W45'): el jueves de esa semana decide el año; se cuenta desde el jueves de la semana 1
const juevesDe = (d: Date) => { const j = new Date(d); j.setUTCDate(j.getUTCDate() - ((j.getUTCDay() + 6) % 7) + 3); return j; };
const semanaISO = (s: string) => {
  const jueves = juevesDe(fechaD(s));
  const anio = jueves.getUTCFullYear();
  const primero = juevesDe(new Date(Date.UTC(anio, 0, 4, 12)));
  const n = 1 + Math.round((jueves.getTime() - primero.getTime()) / (7 * 86400000));
  return `${anio}-W${String(n).padStart(2, '0')}`;
};
const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : '');

// ── Sesión (vista previa: solo Super Admin) ──
async function superAdmin(token: unknown) {
  const jwk = env('SESION_JWK_PRIVADA');
  let llave: CryptoKey | Uint8Array | null = null;
  let alg = 'HS256';
  if (jwk) {
    const { d: _d, key_ops: _k, ...publica } = JSON.parse(jwk) as JWK;
    llave = (await importJWK({ ...publica, alg: 'ES256' }, 'ES256')) as CryptoKey; alg = 'ES256';
  } else if (env('SESION_JWT_SECRET')) llave = new TextEncoder().encode(env('SESION_JWT_SECRET'));
  if (!llave || typeof token !== 'string') throw new Fallo('sin_permiso', 403);
  let id: number;
  try {
    const { payload } = await jwtVerify(token, llave, { issuer: 'gestion-territorial', algorithms: [alg] });
    id = Number(payload.usuario_id);
  } catch { throw new Fallo('sin_permiso', 403); }
  const { data } = await supabase.from('app_usuarios').select('rol, activo').eq('id', id).maybeSingle();
  if (!data || data.activo === false || data.rol !== 'Super Admin') throw new Fallo('sin_permiso', 403);
}

async function todas<T>(armar: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

type Aviso = { clave: string; usuario_id: number; titulo: { es: string; en: string }; mensaje: { es: string; en: string }; ruta: string };

// ── 1. Informe ──
async function avisosInforme(hoy: string): Promise<{ mes: string | null; avisos: Aviso[] }> {
  const dia = Number(hoy.slice(8));
  const mes = esUltimoDia(hoy) ? mesDe(hoy) : (dia === 1 || dia === 2 ? mesAnterior(hoy) : null);
  if (!mes) return { mes: null, avisos: [] };
  const usuarios = await todas<{ id: number; activo: boolean | null }>(() => supabase.from('app_usuarios').select('id, activo').order('id'));
  const enviados = await todas<{ usuario_id: number }>(() => supabase.from('informes_servicio').select('usuario_id').eq('mes', mes).not('enviado_en', 'is', null).order('usuario_id'));
  const ya = new Set(enviados.map((e) => Number(e.usuario_id)));
  const m = Number(mes.slice(5, 7)) - 1;
  return {
    mes,
    avisos: usuarios.filter((u) => u.activo !== false && !ya.has(Number(u.id))).map((u) => ({
      clave: `informe:${mes.slice(0, 7)}:${hoy}:${u.id}`,
      usuario_id: Number(u.id),
      titulo: { es: '📋 Tu informe de servicio', en: '📋 Your field service report' },
      mensaje: { es: `Recuerda enviar tu informe de ${MESES[m]}. Toca aquí para enviarlo.`, en: `Remember to send your ${MONTHS[m]} report. Tap here to send it.` },
      ruta: '/informes',
    })),
  };
}

// ── 2. Turno de exhibidor mañana ──
async function avisosTurnos(hoy: string): Promise<Aviso[]> {
  const manana = masDias(hoy, 1);
  const { data, error } = await supabase.from('exhibidor_turnos')
    .select('id, usuario_id, hora_inicio, hora_fin, estado, exhibidores(nombre)').eq('fecha', manana);
  if (error) throw error;
  return (data ?? []).filter((t) => !['rechazado', 'cancelado'].includes(String(t.estado))).map((t) => {
    // deno-lint-ignore no-explicit-any
    const nombre = (t as any).exhibidores?.nombre || 'el exhibidor';
    return {
      clave: `turno:${t.id}`,
      usuario_id: Number(t.usuario_id),
      titulo: { es: '🗓️ Mañana tienes turno', en: '🗓️ You have a shift tomorrow' },
      mensaje: { es: `${nombre}, de ${hhmm(t.hora_inicio)} a ${hhmm(t.hora_fin)}.`, en: `${nombre}, from ${hhmm(t.hora_inicio)} to ${hhmm(t.hora_fin)}.` },
      ruta: '/exhibidores',
    };
  });
}

// ── 3. Territorios olvidados (lunes) ──
async function avisosTerritorios(hoy: string): Promise<{ porCongregacion: Record<string, string[]>; avisos: Aviso[] }> {
  if (diaSemana(hoy) !== 1) return { porCongregacion: {}, avisos: [] };
  const territorios = await todas<{ id: number; numero: string | null; nombre: string; congregacion_id: string }>(
    () => supabase.from('territorios').select('id, numero, nombre, congregacion_id').order('id'));
  const trabajos = await todas<{ territorio_id: number; estado: string; fecha_fin: string | null }>(
    () => supabase.from('territorio_trabajos').select('territorio_id, estado, fecha_fin').order('id'));
  const limite = masDias(hoy, -MESES_SIN_TRABAJAR * 30);
  const porCongregacion: Record<string, string[]> = {};
  for (const t of territorios) {
    const suyos = trabajos.filter((w) => w.territorio_id === t.id);
    if (suyos.some((w) => w.estado === 'en_progreso')) continue;
    const ultimo = suyos.filter((w) => w.estado === 'completado' && w.fecha_fin).map((w) => String(w.fecha_fin)).sort().pop();
    if (!ultimo || ultimo < limite) (porCongregacion[t.congregacion_id] ??= []).push(t.numero || t.nombre);
  }
  const congs = Object.keys(porCongregacion);
  if (!congs.length) return { porCongregacion, avisos: [] };
  const { data: responsables, error } = await supabase.from('app_usuarios')
    .select('id, congregacion_id, rol, activo').in('congregacion_id', congs).in('rol', ['Anciano', 'Admin Principal']);
  if (error) throw error;
  const semana = semanaISO(hoy);
  const avisos = (responsables ?? []).filter((u) => u.activo !== false).map((u) => {
    const lista = porCongregacion[u.congregacion_id].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
    const muestra = lista.slice(0, 8).join(', ') + (lista.length > 8 ? ` y ${lista.length - 8} más` : '');
    return {
      clave: `territorios:${semana}:${u.id}`,
      usuario_id: Number(u.id),
      titulo: { es: `🗺️ ${lista.length} territorios sin trabajar`, en: `🗺️ ${lista.length} territories not worked` },
      mensaje: {
        es: `Llevan más de ${MESES_SIN_TRABAJAR} meses sin trabajarse: ${muestra}. Asígnalos a un grupo.`,
        en: `Not worked for more than ${MESES_SIN_TRABAJAR} months: ${muestra}. Assign them to a group.`,
      },
      ruta: '/grupos',
    };
  });
  return { porCongregacion, avisos };
}

// ── Envío (agrupa los avisos con el mismo texto en una sola llamada a OneSignal) ──
async function mandar(avisos: Aviso[]) {
  if (!env('ONESIGNAL_APP_ID') || !env('ONESIGNAL_REST_API_KEY')) return { enviados: 0, sinOneSignal: true };
  const grupos = new Map<string, Aviso[]>();
  for (const a of avisos) {
    const k = JSON.stringify([a.titulo, a.mensaje, a.ruta]);
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  const app = env('APP_URL').replace(/\/$/, '');
  let enviados = 0;
  for (const lista of grupos.values()) {
    const { titulo, mensaje, ruta } = lista[0];
    const res = await fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${env('ONESIGNAL_REST_API_KEY')}` },
      body: JSON.stringify({
        app_id: env('ONESIGNAL_APP_ID'), target_channel: 'push',
        include_aliases: { external_id: lista.map((a) => String(a.usuario_id)) },
        headings: titulo, contents: mensaje, url: `${app}${ruta}`, chrome_web_icon: `${app}/icons/notification-icon.png`,
      }),
    });
    if (!res.ok) { console.error('OneSignal', res.status, await res.text()); continue; }
    enviados += lista.length;
    await supabase.from('recordatorios_enviados').insert(lista.map((a) => ({ clave: a.clave, usuario_id: a.usuario_id })));
  }
  return { enviados, sinOneSignal: false };
}

async function atender(accion: string, d: Record<string, unknown>, secreto: string | null) {
  const secretoBueno = env('RECORDATORIOS_SECRETO') || env('RESPALDO_SECRETO');
  const conSecreto = !!secretoBueno && secreto === secretoBueno;
  if (accion === 'enviar' && !conSecreto) throw new Fallo('sin_permiso', 403);
  if (accion === 'vista_previa' && !conSecreto) await superAdmin(d.token);
  if (accion !== 'enviar' && accion !== 'vista_previa') throw new Fallo('accion_desconocida');

  const hoy = typeof d.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.hoy) ? d.hoy : hoyMexico();
  // Sin la bitácora no se manda nada (se repetirían)
  const { error: errTabla } = await supabase.from('recordatorios_enviados').select('clave', { head: true, count: 'exact' }).limit(1);
  if (errTabla) throw new Fallo('falta_migracion_16', 503);

  const [informe, turnos, territorios] = await Promise.all([avisosInforme(hoy), avisosTurnos(hoy), avisosTerritorios(hoy)]);
  const todos = [...informe.avisos, ...turnos, ...territorios.avisos];
  // Quitar los que ya se mandaron
  const yaEnviados = new Set<string>();
  for (let i = 0; i < todos.length; i += 200) {
    const { data } = await supabase.from('recordatorios_enviados').select('clave').in('clave', todos.slice(i, i + 200).map((a) => a.clave));
    (data ?? []).forEach((r) => yaEnviados.add(r.clave));
  }
  const pendientes = todos.filter((a) => !yaEnviados.has(a.clave));
  const resumen = {
    hoy,
    informe: { mes: informe.mes, avisos: informe.avisos.length },
    turnos: turnos.length,
    territorios: { congregaciones: Object.keys(territorios.porCongregacion).length, avisos: territorios.avisos.length },
    yaEnviados: todos.length - pendientes.length,
    porEnviar: pendientes.length,
    muestra: pendientes.slice(0, 20).map((a) => ({ usuario_id: a.usuario_id, titulo: a.titulo.es, mensaje: a.mensaje.es })),
  };
  if (accion === 'vista_previa') return { ...resumen, enviados: 0 };
  return { ...resumen, ...(await mandar(pendientes)) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'metodo' }, { status: 405, headers: cors });
  try {
    const d = await req.json().catch(() => ({}));
    const resultado = await atender(String(d.accion ?? ''), d, req.headers.get('x-cron-secreto'));
    console.log(JSON.stringify({ ...resultado, muestra: undefined }));
    return Response.json(resultado, { headers: cors });
  } catch (err) {
    if (err instanceof Fallo) return Response.json({ error: err.codigo }, { status: err.status, headers: cors });
    console.error(err);
    return Response.json({ error: 'servidor' }, { status: 500, headers: cors });
  }
});
