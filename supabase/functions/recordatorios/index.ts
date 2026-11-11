// Supabase Edge Function: recordatorios
// La llama pg_cron todos los días a las 7 p. m. (hora del centro de México; MIGRACION_16B) y decide qué toca:
//   1. Informe: el último día del mes y los días 1 y 2 → a quien no ha enviado su informe de ese mes.
//   2. Exhibidor: un día antes del turno → a quien le toca (si no está rechazado ni cancelado).
//   3. Territorios: los lunes → a ancianos y admins, los territorios con más de 4 meses sin trabajarse.
//   4. Aseo del Salón (Migración 17): un día antes de cada reunión (7 p. m.) y el mismo día (8 a. m., MIGRACION_17B
//      con { momento: 'manana' }) → a los hermanos del grupo al que le toca esa semana. Se guarda en `notificaciones`
//      (la app muestra el mensaje con el versículo y el webhook `push-notificaciones` manda el push).
// Nunca repite: cada aviso se anota en recordatorios_enviados (Migración 16). Push por OneSignal (mismos secretos
// que `enviar-push`). Un Super Admin puede pedir la vista previa (quién lo recibiría hoy) sin mandar nada.
//
// Acciones (POST { accion, hoy?, momento? }):   momento = 'tarde' (7 p. m., todo) | 'manana' (8 a. m., solo aseo)
//   enviar        (encabezado x-cron-secreto = RECORDATORIOS_SECRETO o RESPALDO_SECRETO) → resumen
//   vista_previa  { token } de Super Admin → resumen sin mandar nada
//   probar        { token } de Super Admin → le manda a ÉL una prueba (push directo + aviso del aseo)
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
  return id;
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

// ── 4. Aseo del Salón (copia de src/utils/aseo.js: si cambias una, cambia la otra) ──
const VERSICULO = '“Porque Dios no es un Dios de desorden, sino de paz.”';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const lunesDe = (s: string) => masDias(s, -((fechaD(s).getUTCDay() + 6) % 7));
const semanasEntre = (a: string, b: string) => Math.round((fechaD(b).getTime() - fechaD(a).getTime()) / (7 * 86400000));
type Reunion = { dia: number; hora: string };
type PlanAseo = { congregacion_id: string; reuniones: unknown; orden_grupos: (number | string)[] | null; inicio: string | null };
type CambioAseo = { congregacion_id: string; semana: string; grupo_id: number | null; sin_aseo: boolean | null; reuniones: unknown };
const limpiarReuniones = (lista: unknown): Reunion[] => (Array.isArray(lista) ? lista : [])
  // deno-lint-ignore no-explicit-any
  .filter((r: any) => r && Number.isInteger(Number(r.dia)) && Number(r.dia) >= 0 && Number(r.dia) <= 6)
  // deno-lint-ignore no-explicit-any
  .map((r: any) => ({ dia: Number(r.dia), hora: /^\d{2}:\d{2}/.test(String(r.hora || '')) ? String(r.hora).slice(0, 5) : '' }))
  .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7));
function aseoDelDia(plan: PlanAseo, cambios: CambioAseo[], grupos: { id: number | string }[], fecha: string) {
  const s = semanaDeAseo(plan, cambios, grupos, fecha);
  const reunion = s.reuniones.find((r) => masDias(s.lunes, (r.dia + 6) % 7) === fecha);
  return reunion && s.grupo_id ? { grupo_id: s.grupo_id, hora: reunion.hora } : null;
}
function semanaDeAseo(plan: PlanAseo, cambios: CambioAseo[], grupos: { id: number | string }[], fecha: string) {
  const lunes = lunesDe(fecha);
  const cambio = cambios.find((c) => String(c.semana).slice(0, 10) === lunes) || null;
  const ids = new Set(grupos.map((g) => String(g.id)));
  const orden = (plan.orden_grupos || []).map(String).filter((id) => ids.has(id));
  let grupo_id: string | null = null;
  if (cambio) grupo_id = cambio.sin_aseo ? null : (cambio.grupo_id != null ? String(cambio.grupo_id) : null);
  else if (orden.length && plan.inicio) {
    const n = semanasEntre(lunesDe(String(plan.inicio).slice(0, 10)), lunes);
    grupo_id = orden[((n % orden.length) + orden.length) % orden.length];
  }
  const base = Array.isArray(cambio?.reuniones) && (cambio?.reuniones as unknown[]).length ? cambio?.reuniones : plan.reuniones;
  return { lunes, grupo_id, reuniones: limpiarReuniones(base) };
}
const hora12 = (h: string) => {
  if (!/^\d{2}:\d{2}/.test(String(h || ''))) return '';
  const [hh, mm] = String(h).split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
};
const fechaLarga = (s: string) => { const d = fechaD(s); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };
const textoAvisoAseo = ({ grupo, fecha, hora, cuando }: { grupo: string; fecha: string; hora: string; cuando: string }) => {
  const dia = `${cuando === 'hoy' ? 'hoy' : 'mañana'} ${fechaLarga(fecha)}`;
  return {
    titulo: `🧹 ${grupo}: aseo del Salón ${cuando === 'hoy' ? 'hoy' : 'mañana'}`,
    mensaje: `${VERSICULO} ¡${grupo}, tienen el increíble privilegio de realizar el aseo del Salón del Reino ${dia}${hora ? ` (reunión de las ${hora12(hora)})` : ''}! Gracias por su amor y su esfuerzo. 💙`,
  };
};

type AvisoAseo = { clave: string; usuario_id: number; titulo: string; mensaje: string; metadata: Record<string, unknown> };
async function avisosAseo(hoy: string, momento: string): Promise<{ sinMigracion?: boolean; grupos: number; avisos: AvisoAseo[] }> {
  const fecha = momento === 'manana' ? hoy : masDias(hoy, 1);
  const cuando = momento === 'manana' ? 'hoy' : 'manana';
  const { data: planes, error } = await supabase.from('aseo_planes').select('*').eq('avisos', true);
  if (error) return { sinMigracion: true, grupos: 0, avisos: [] }; // sin la Migración 17 los demás recordatorios siguen
  const congs = (planes ?? []).map((p) => p.congregacion_id);
  if (!congs.length) return { grupos: 0, avisos: [] };
  const [{ data: cambios }, { data: grupos }] = await Promise.all([
    supabase.from('aseo_cambios').select('*').in('congregacion_id', congs).eq('semana', lunesDe(fecha)),
    supabase.from('grupos_predicacion').select('id, nombre, color, congregacion_id').in('congregacion_id', congs),
  ]);
  const toca: { grupo: { id: number; nombre: string; color: string | null; congregacion_id: string }; hora: string }[] = [];
  for (const plan of planes as PlanAseo[]) {
    const suyos = (grupos ?? []).filter((g) => g.congregacion_id === plan.congregacion_id);
    const r = aseoDelDia(plan, ((cambios ?? []) as CambioAseo[]).filter((c) => c.congregacion_id === plan.congregacion_id), suyos, fecha);
    const grupo = r && suyos.find((g) => String(g.id) === r.grupo_id);
    if (grupo) toca.push({ grupo, hora: r.hora });
  }
  if (!toca.length) return { grupos: 0, avisos: [] };
  const { data: miembros, error: errM } = await supabase.from('app_usuarios')
    .select('id, activo, grupo_id, congregacion_id').in('grupo_id', toca.map((x) => x.grupo.id));
  if (errM) throw errM;
  const avisos: AvisoAseo[] = [];
  for (const { grupo, hora } of toca) {
    const { titulo, mensaje } = textoAvisoAseo({ grupo: grupo.nombre, fecha, hora, cuando });
    for (const u of (miembros ?? []).filter((m) => String(m.grupo_id) === String(grupo.id) && m.congregacion_id === grupo.congregacion_id && m.activo !== false)) {
      avisos.push({
        clave: `aseo:${fecha}:${cuando}:${u.id}`,
        usuario_id: Number(u.id),
        titulo, mensaje,
        metadata: { tipo: 'aseo', grupo: grupo.nombre, grupo_id: grupo.id, color: grupo.color || null, fecha, hora, cuando },
      });
    }
  }
  return { grupos: toca.length, avisos };
}

// Aseo: se guarda en `notificaciones` (la app lo muestra en pantalla y el webhook manda el push)
// Si la tabla no tiene `metadata` (falta la Migración 17C) se guarda sin ella: el push sale igual (sin la ventana).
const faltaColumna = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /metadata/.test(e.message || ''));
async function mandarAseo(avisos: AvisoAseo[]) {
  let enviados = 0;
  let error: string | null = null;
  let sinMetadata = false;
  for (let i = 0; i < avisos.length; i += 200) {
    const lote = avisos.slice(i, i + 200);
    const filas = lote.map((a) => ({
      usuario_destino_id: a.usuario_id, tipo: 'sistema', titulo: a.titulo, mensaje: a.mensaje, metadata: a.metadata,
    }));
    let res = await supabase.from('notificaciones').insert(filas);
    if (faltaColumna(res.error)) {
      sinMetadata = true;
      res = await supabase.from('notificaciones').insert(filas.map(({ metadata: _m, ...resto }) => resto));
    }
    if (res.error) { console.error('notificaciones aseo', res.error); error = `${res.error.code ?? ''} ${res.error.message ?? ''}`.trim(); continue; }
    enviados += lote.length;
    await supabase.from('recordatorios_enviados').insert(lote.map((a) => ({ clave: a.clave, usuario_id: a.usuario_id })));
  }
  // Se reporta en la respuesta (la guarda pg_net): así se ve en DIAGNOSTICO_ASEO.sql si algo falló
  return { enviados, ...(error ? { error } : {}), ...(sinMetadata ? { sinMetadata: true } : {}) };
}

// ── Prueba (Super Admin, SOLO a sí mismo; no se anota en la bitácora) ──
//   1. Push directo por OneSignal (el camino del informe, los turnos y los territorios): dice si OneSignal
//      conoce este usuario (external_id) o si su teléfono no está suscrito.
//   2. Aviso del aseo como el de verdad: se guarda en notificaciones → push por el webhook + ventana en la app.
async function probar(usuarioId: number, hoy: string) {
  const app = env('APP_URL').replace(/\/$/, '');
  let push: Record<string, unknown>;
  if (!env('ONESIGNAL_APP_ID') || !env('ONESIGNAL_REST_API_KEY')) push = { ok: false, motivo: 'sin_onesignal' };
  else {
    try {
      const res = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${env('ONESIGNAL_REST_API_KEY')}` },
        body: JSON.stringify({
          app_id: env('ONESIGNAL_APP_ID'), target_channel: 'push',
          include_aliases: { external_id: [String(usuarioId)] },
          headings: { es: '🔔 Prueba de recordatorios', en: '🔔 Reminders test' },
          contents: { es: 'Si ves esto, los recordatorios automáticos sí te llegan a este teléfono.', en: 'If you see this, automatic reminders reach this phone.' },
          url: `${app}/backup`, chrome_web_icon: `${app}/icons/notification-icon.png`,
        }),
      });
      // deno-lint-ignore no-explicit-any
      const cuerpo: any = await res.json().catch(() => ({}));
      const errores = cuerpo?.errors ?? null;
      push = { ok: res.ok && !!cuerpo?.id && !errores, status: res.status, id: cuerpo?.id || null, ...(errores ? { errores } : {}) };
    } catch (e) { push = { ok: false, motivo: 'red', detalle: String(e) }; }
  }

  // Aviso del aseo: el grupo de esta semana en su congregación (o uno genérico si no hay planeación)
  const { data: yo } = await supabase.from('app_usuarios').select('congregacion_id').eq('id', usuarioId).maybeSingle();
  let grupo = 'Tu grupo', color: string | null = null, hora = '';
  if (yo?.congregacion_id) {
    const { data: plan } = await supabase.from('aseo_planes').select('*').eq('congregacion_id', yo.congregacion_id).maybeSingle();
    if (plan) {
      const [{ data: cambios }, { data: grupos }] = await Promise.all([
        supabase.from('aseo_cambios').select('*').eq('congregacion_id', yo.congregacion_id).eq('semana', lunesDe(hoy)),
        supabase.from('grupos_predicacion').select('id, nombre, color, congregacion_id').eq('congregacion_id', yo.congregacion_id),
      ]);
      const s = semanaDeAseo(plan as PlanAseo, (cambios ?? []) as CambioAseo[], grupos ?? [], hoy);
      const g = (grupos ?? []).find((x) => String(x.id) === s.grupo_id);
      if (g) { grupo = g.nombre; color = g.color || null; }
      hora = s.reuniones.find((r) => masDias(s.lunes, (r.dia + 6) % 7) >= hoy)?.hora ?? s.reuniones[0]?.hora ?? '';
    }
  }
  const t = textoAvisoAseo({ grupo, fecha: hoy, hora, cuando: 'hoy' });
  const fila = {
    usuario_destino_id: usuarioId, tipo: 'sistema', titulo: `🧪 Prueba — ${t.titulo}`, mensaje: t.mensaje,
    metadata: { tipo: 'aseo', prueba: true, grupo, color, fecha: hoy, hora, cuando: 'hoy' },
  };
  let res = await supabase.from('notificaciones').insert([fila]);
  let sinMetadata = false;
  if (faltaColumna(res.error)) { sinMetadata = true; const { metadata: _m, ...resto } = fila; res = await supabase.from('notificaciones').insert([resto]); }
  const aseo = { ok: !res.error, grupo, ...(res.error ? { error: `${res.error.code ?? ''} ${res.error.message ?? ''}`.trim() } : {}), ...(sinMetadata ? { sinMetadata: true } : {}) };
  return { usuario_id: usuarioId, hoy, push, aseo };
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
  const hoy = typeof d.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.hoy) ? d.hoy : hoyMexico();
  if (accion === 'probar') return await probar(await superAdmin(d.token), hoy);
  if (accion !== 'enviar' && accion !== 'vista_previa') throw new Fallo('accion_desconocida');

  // Sin la bitácora no se manda nada (se repetirían)
  const { error: errTabla } = await supabase.from('recordatorios_enviados').select('clave', { head: true, count: 'exact' }).limit(1);
  if (errTabla) throw new Fallo('falta_migracion_16', 503);

  // 'manana' (8 a. m.) = solo el aviso del aseo de ese día; 'tarde' (7 p. m., lo de siempre) = todo
  const momento = d.momento === 'manana' ? 'manana' : 'tarde';
  const vacio = { mes: null, avisos: [] as Aviso[] };
  const [informe, turnos, territorios, aseo] = await Promise.all([
    momento === 'tarde' ? avisosInforme(hoy) : vacio,
    momento === 'tarde' ? avisosTurnos(hoy) : [] as Aviso[],
    momento === 'tarde' ? avisosTerritorios(hoy) : { porCongregacion: {}, avisos: [] as Aviso[] },
    avisosAseo(hoy, momento),
  ]);
  const todos = [...informe.avisos, ...turnos, ...territorios.avisos];
  // Quitar los que ya se mandaron
  const yaEnviados = new Set<string>();
  const claves = [...todos.map((a) => a.clave), ...aseo.avisos.map((a) => a.clave)];
  for (let i = 0; i < claves.length; i += 200) {
    const { data } = await supabase.from('recordatorios_enviados').select('clave').in('clave', claves.slice(i, i + 200));
    (data ?? []).forEach((r) => yaEnviados.add(r.clave));
  }
  const pendientes = todos.filter((a) => !yaEnviados.has(a.clave));
  const aseoPendientes = aseo.avisos.filter((a) => !yaEnviados.has(a.clave));
  const resumen = {
    hoy,
    momento,
    informe: { mes: informe.mes, avisos: informe.avisos.length },
    turnos: turnos.length,
    territorios: { congregaciones: Object.keys(territorios.porCongregacion).length, avisos: territorios.avisos.length },
    aseo: { grupos: aseo.grupos, avisos: aseo.avisos.length, ...(aseo.sinMigracion ? { sinMigracion: true } : {}) },
    yaEnviados: claves.length - pendientes.length - aseoPendientes.length,
    porEnviar: pendientes.length + aseoPendientes.length,
    muestra: [
      ...aseoPendientes.map((a) => ({ usuario_id: a.usuario_id, titulo: a.titulo, mensaje: a.mensaje })),
      ...pendientes.map((a) => ({ usuario_id: a.usuario_id, titulo: a.titulo.es, mensaje: a.mensaje.es })),
    ].slice(0, 20),
  };
  if (accion === 'vista_previa') return { ...resumen, enviados: 0 };
  const push = await mandar(pendientes);
  const aseoRes = await mandarAseo(aseoPendientes);
  return {
    ...resumen, ...push, enviados: push.enviados + aseoRes.enviados, aseoEnviados: aseoRes.enviados,
    ...(aseoRes.error ? { aseoError: aseoRes.error } : {}), ...(aseoRes.sinMetadata ? { aseoSinMetadata: true } : {}),
  };
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
