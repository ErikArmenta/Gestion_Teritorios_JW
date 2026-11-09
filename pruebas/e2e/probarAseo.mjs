// Aseo del Salón por grupos (Migración 17):
//  1. Lógica de la rotación (src/utils/aseo.js): un grupo por semana, recurrente, cambios de una semana.
//  2. Función REAL `recordatorios`: aviso un día antes (7 p. m.) y el mismo día (8 a. m.), solo al grupo que le toca,
//     por congregación, sin repetir; y que calcule IGUAL que la app (la lógica está copiada allá).
//  3. Pantalla: planear en Grupos, cambiar una semana, vista previa, sin migración, y la ventana del aviso.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';
import { hastaQue, hastaQueNode, escribir } from '../apoyo/esperas.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);
const A = await import(pathToFileURL(path.join(RAIZ, 'src/utils/aseo.js')).href);

// ── 1. Lógica ──
const grupos = [
  { id: 11, nombre: 'Grupo Juárez', color: '#10B981', congregacion_id: 'c1' },
  { id: 12, nombre: 'Grupo Hidalgo', color: '#F59E0B', congregacion_id: 'c1' },
  { id: 13, nombre: 'Grupo Morelos', color: '#8B5CF6', congregacion_id: 'c1' },
];
const plan = { congregacion_id: 'c1', reuniones: [{ dia: 0, hora: '10:00' }, { dia: 4, hora: '19:30' }], orden_grupos: [11, 12, 13], inicio: '2026-11-04', avisos: true };
const sem = (lunes, cambios = []) => A.semanaAseo(plan, cambios, grupos, lunes);
revisar(A.lunesDe('2026-11-04') === '2026-11-02' && A.lunesDe('2026-11-08') === '2026-11-02' && A.lunesDe('2026-11-09') === '2026-11-09', 'la semana va de lunes a domingo');
let s = sem('2026-11-02');
revisar(s.grupo_id === '11' && s.reuniones.map(r => r.fecha).join(',') === '2026-11-05,2026-11-08', `semana 1: primer grupo, reuniones jueves 5 y domingo 8 (${s.reuniones.map(r => r.fecha)})`);
revisar(sem('2026-11-09').grupo_id === '12' && sem('2026-11-16').grupo_id === '13' && sem('2026-11-23').grupo_id === '11' && sem('2027-11-01').grupo_id === String([11, 12, 13][52 % 3]), 'recurrente: 11 → 12 → 13 → 11 … (también un año después)');
revisar(sem('2026-10-26').grupo_id === '13', 'antes del inicio también cuadra (la semana anterior al primero = el último)');
const cambios = [{ semana: '2026-11-16', sin_aseo: true, grupo_id: null }, { semana: '2026-11-30', grupo_id: 11, sin_aseo: false, reuniones: [{ dia: 2, hora: '19:00' }] }];
revisar(sem('2026-11-16', cambios).grupo_id === null && sem('2026-11-23', cambios).grupo_id === '11', 'sin aseo una semana: la rotación NO se recorre');
s = sem('2026-11-30', cambios);
revisar(s.grupo_id === '11' && s.reuniones.length === 1 && s.reuniones[0].fecha === '2026-12-01' && s.reuniones[0].hora === '19:00', 'cambio de grupo y de días esa semana (martes, visita del superintendente)');
revisar(A.semanaAseo(plan, [], grupos.filter(g => g.id !== 12), '2026-11-09').grupo_id === '13', 'grupo borrado: la rotación sigue con los demás');
revisar(A.aseoDelDia(plan, [], grupos, '2026-11-05')?.hora === '19:30' && A.aseoDelDia(plan, [], grupos, '2026-11-06') === null, 'aviso solo los días con reunión');
revisar(A.hora12('19:30') === '7:30 p. m.' && A.hora12('10:00') === '10:00 a. m.' && A.hora12('12:00') === '12:00 p. m.' && A.hora12('00:15') === '12:15 a. m.', 'hora en formato de 12 h');
const tx = A.textoAvisoAseo({ grupo: 'Grupo Juárez', fecha: '2026-11-05', hora: '19:30', cuando: 'manana' });
revisar(tx.mensaje.startsWith('“Porque Dios no es un Dios de desorden, sino de paz.” ¡Grupo Juárez') && !/Corintios|14:33/.test(tx.mensaje) && tx.mensaje.includes('¡Grupo Juárez, tienen el increíble privilegio de realizar el aseo del Salón del Reino mañana jueves 5 de noviembre (reunión de las 7:30 p. m.)!'),
  `texto del aviso: ${tx.mensaje}`);

// ── 2. Función recordatorios ──
const entorno = { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', RESPALDO_SECRETO: 'cron-123', SESION_JWT_SECRET: 'secreto-legacy-de-prueba-con-mas-de-32-caracteres', ONESIGNAL_APP_ID: 'app', ONESIGNAL_REST_API_KEY: 'key', APP_URL: 'https://app.local' };
const { handler, db } = await cargarFuncion(`${RAIZ}/supabase/functions/recordatorios/index.ts`, entorno);
const pushes = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.onesignal.com/')) { pushes.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); }
  return fetchReal(url, init);
};
const reiniciar = () => {
  db.app_usuarios = [
    { id: 2, nombre: 'Anciano', rol: 'Anciano', activo: true, congregacion_id: 'c1', grupo_id: 12 },
    { id: 3, nombre: 'Pub Juárez', rol: 'Publicador', activo: true, congregacion_id: 'c1', grupo_id: 11 },
    { id: 5, nombre: 'Inactivo', rol: 'Publicador', activo: false, congregacion_id: 'c1', grupo_id: 11 },
    { id: 7, nombre: 'Pub Morelos', rol: 'Publicador', activo: true, congregacion_id: 'c1', grupo_id: 13 },
    { id: 4, nombre: 'Pub Norte', rol: 'Publicador', activo: true, congregacion_id: 'c2', grupo_id: 21 },
  ];
  db.grupos_predicacion = [...grupos.map(g => ({ ...g })), { id: 21, nombre: 'Grupo Norte', color: '#EF4444', congregacion_id: 'c2' }];
  db.aseo_planes = [{ ...plan }, { congregacion_id: 'c2', reuniones: [{ dia: 3, hora: '19:00' }], orden_grupos: [21], inicio: '2026-11-02', avisos: false }];
  db.aseo_cambios = [];
  db.notificaciones = [];
  db.recordatorios_enviados = [];
  db.informes_servicio = []; db.exhibidor_turnos = []; db.territorios = []; db.territorio_trabajos = [];
  pushes.length = 0;
};
const llamar = async (cuerpo, cab = { 'x-cron-secreto': 'cron-123' }) => {
  const r = await handler(new Request('https://x/f', { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) }));
  return { status: r.status, body: await r.json() };
};
const para = () => db.notificaciones.map(n => n.usuario_destino_id).sort().join(',');

reiniciar();
let r = await llamar({ accion: 'enviar', hoy: '2026-11-04' }); // miércoles 7 p. m. → reunión del jueves 5
let n0 = db.notificaciones[0];
revisar(r.status === 200 && para() === '3', `un día antes: solo al grupo que le toca (no al inactivo ni a otra congregación) → ${para()}`);
revisar(n0?.tipo === 'sistema' && n0.titulo === '🧹 Grupo Juárez: aseo del Salón mañana' && n0.mensaje === tx.mensaje, `notificación con el texto bonito (${n0?.titulo})`);
revisar(n0?.metadata?.tipo === 'aseo' && n0.metadata.fecha === '2026-11-05' && n0.metadata.hora === '19:30' && n0.metadata.cuando === 'manana' && n0.metadata.color === '#10B981', 'metadata para la ventana de la app (fecha, hora, color del grupo)');
revisar(pushes.length === 0 && r.body.aseo.avisos === 1 && r.body.enviados === 1, 'el push lo manda el webhook de notificaciones (no se duplica)');
r = await llamar({ accion: 'enviar', hoy: '2026-11-04' });
revisar(db.notificaciones.length === 1 && r.body.yaEnviados === 1, 'pg_cron repite: no se duplica');
r = await llamar({ accion: 'enviar', hoy: '2026-11-05', momento: 'manana' }); // jueves 8 a. m.
revisar(db.notificaciones.length === 2 && db.notificaciones[1].metadata.cuando === 'hoy' && db.notificaciones[1].titulo.endsWith('hoy'), 'el mismo día (8 a. m.): segundo aviso "hoy"');
r = await llamar({ accion: 'enviar', hoy: '2026-11-05' }); // jueves 7 p. m.: no hay reunión el viernes
revisar(db.notificaciones.length === 2, 'sin reunión al día siguiente: nada');
reiniciar();
r = await llamar({ accion: 'enviar', hoy: '2026-11-01', momento: 'manana' }); // domingo 1 (día de informe), 8 a. m.
revisar(para() === '7' && r.body.informe.mes === null && pushes.length === 0, `en la mañana SOLO aseo (no el informe del día 1); domingo 1 = semana del Grupo Morelos → ${para()}`);
reiniciar();
r = await llamar({ accion: 'enviar', hoy: '2026-11-03' }); // martes: c2 se reúne el miércoles pero tiene los avisos apagados
revisar(db.notificaciones.length === 0, 'congregación con avisos apagados: nada');
reiniciar();
db.aseo_cambios = [{ congregacion_id: 'c1', semana: '2026-11-09', grupo_id: 11, sin_aseo: false, reuniones: null }, { congregacion_id: 'c1', semana: '2026-11-16', grupo_id: null, sin_aseo: true }];
await llamar({ accion: 'enviar', hoy: '2026-11-11' });
revisar(para() === '3', 'cambio de una semana: avisa al grupo del cambio');
db.notificaciones = [];
await llamar({ accion: 'enviar', hoy: '2026-11-18' });
revisar(db.notificaciones.length === 0, 'semana sin aseo (asamblea): nadie recibe aviso');
reiniciar();
r = await llamar({ accion: 'vista_previa', hoy: '2026-11-04' });
revisar(r.body.aseo.avisos === 1 && r.body.muestra.some(m => m.titulo.includes('Grupo Juárez')) && db.notificaciones.length === 0, 'vista previa: dice a quién, sin mandar');
reiniciar();
delete db.aseo_planes;
r = await llamar({ accion: 'enviar', hoy: '2026-11-04' });
revisar(r.status === 200 && r.body.aseo.sinMigracion === true, 'sin la Migración 17: los demás recordatorios siguen igual');

// Igual que la app: 140 días seguidos, tarde y mañana, con cambios
reiniciar();
const cambiosEq = [
  { congregacion_id: 'c1', semana: '2026-12-07', grupo_id: 13, sin_aseo: false, reuniones: null },
  { congregacion_id: 'c1', semana: '2026-12-21', grupo_id: null, sin_aseo: true, reuniones: null },
  { congregacion_id: 'c1', semana: '2027-01-11', grupo_id: 12, sin_aseo: false, reuniones: [{ dia: 2, hora: '19:00' }, { dia: 6, hora: '17:00' }] },
];
db.aseo_cambios = cambiosEq.map(c => ({ ...c }));
let distintos = 0;
for (let i = 0; i < 140; i++) {
  const hoy = A.masDias('2026-10-20', i);
  for (const momento of ['tarde', 'manana']) {
    const fecha = momento === 'manana' ? hoy : A.masDias(hoy, 1);
    const esperado = A.aseoDelDia(plan, cambiosEq, grupos, fecha);
    const vp = (await llamar({ accion: 'vista_previa', hoy, momento })).body;
    const titulo = vp.muestra.find(m => m.titulo.startsWith('🧹'))?.titulo || null;
    const nombre = esperado ? grupos.find(g => String(g.id) === esperado.grupo_id).nombre : null;
    if ((nombre ? !titulo?.includes(nombre) : !!titulo)) distintos++;
  }
}
revisar(distintos === 0, `la función calcula igual que la app (280 casos, ${distintos} distintos)`);

// ── 3. Pantalla ──
const hoyLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = hoyLocal();
const tabla = {
  congregaciones: [{ id: 'c1', nombre: 'Centro' }],
  grupos_predicacion: grupos.map(g => ({ ...g, activo: true })),
  app_usuarios: [
    { id: 2, nombre: 'Daniel', rol: 'Anciano', activo: true, congregacion_id: 'c1', grupo_id: 12 },
    { id: 3, nombre: 'Ana', rol: 'Publicador', activo: true, congregacion_id: 'c1', grupo_id: 11 },
  ],
  aseo_planes: [], aseo_cambios: [],
  notificaciones: [],
};
let sinMigracion = false;
const escrituras = [];
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
const filtrar = (filas, params) => {
  let res = filas;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const [op, ...resto] = v.split('.');
    const val = resto.join('.');
    if (op === 'eq') res = res.filter(f => String(f[k]) === val);
    if (op === 'gte') res = res.filter(f => String(f[k]) >= val);
    if (op === 'in') { const vs = val.replace(/^\(|\)$/g, '').split(','); res = res.filter(f => vs.includes(String(f[k]))); }
  }
  return res;
};
page.on('request', (req) => {
  const u = new URL(req.url());
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  if (u.pathname.startsWith('/functions/')) return json(404, {});
  const t = u.pathname.split('/').pop();
  if (sinMigracion && t.startsWith('aseo_')) return json(404, { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` });
  const filas = tabla[t] || [];
  const params = [...u.searchParams.entries()];
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  if (req.method() === 'GET') {
    const res = filtrar(filas, params);
    if ((req.headers().accept || '').includes('vnd.pgrst.object')) return res.length ? json(200, res[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' });
    return json(200, res);
  }
  const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
  escrituras.push({ metodo: req.method(), tabla: t, url: decodeURIComponent(u.search), cuerpo });
  if (!tabla[t]) return json(201, []);
  if (req.method() === 'POST') {
    const conflicto = (u.searchParams.get('on_conflict') || 'id').split(',');
    for (const v of (Array.isArray(cuerpo) ? cuerpo : [cuerpo])) {
      const ex = tabla[t].find(f => conflicto.every(c => String(f[c]) === String(v[c])));
      if (ex) Object.assign(ex, v); else tabla[t].push({ id: Math.floor(Math.random() * 1e6), ...v });
    }
    return json(201, []);
  }
  if (req.method() === 'PATCH') { filtrar(filas, params).forEach(f => Object.assign(f, cuerpo)); return json(200, []); }
  if (req.method() === 'DELETE') { const quitar = new Set(filtrar(filas, params)); tabla[t] = filas.filter(f => !quitar.has(f)); return json(200, []); }
  return json(200, []);
});
const usuario = (id) => tabla.app_usuarios.find(u => u.id === id);
const entrarComo = async (id, extra = {}) => {
  await page.evaluateOnNewDocument((u, extra) => {
    try {
      localStorage.setItem('territorial_user', JSON.stringify({ ...u, usuario: 'x', congregacion_nombre: 'Centro' }));
      localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
      sessionStorage.setItem('notif_banner_dismissed', 'true');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    } catch { /* */ }
  }, usuario(id), extra);
};
const texto = () => page.evaluate(() => document.body.innerText);
const clicTexto = (x) => page.evaluate((y) => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().includes(y) && !e.disabled); b?.click(); return !!b; }, x);
const sinScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const filasSemana = () => page.evaluate(() => [...document.querySelectorAll('[data-semana]')].map(e => ({ lunes: e.dataset.semana, txt: e.innerText.replace(/\s+/g, ' ') })));

await entrarComo(2);
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/grupos`, { waitUntil: 'networkidle2' });
await hastaQue(page, () => document.body.innerText.includes('Planear aseo'));
let txt = await texto();
revisar(txt.includes('Aseo del Salón del Reino') && txt.includes('Aún no hay planeación del aseo'), 'Grupos: sección del aseo (sin planeación todavía)');
await clicTexto('Planear aseo');
await hastaQue(page, () => document.body.innerText.includes('Planeación del aseo'));
const dias = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"]')].length);
revisar(dias === 2, `planeación: por defecto jueves y domingo (${dias} días)`);
// Subir el segundo grupo al primer lugar
await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Subir"]')][1]?.click());
await espera(200);
await clicTexto('Guardar');
await hastaQueNode(() => escrituras.some(e => e.tabla === 'aseo_planes'));
await hastaQue(page, () => document.querySelectorAll('[data-semana]').length === 8);
const wPlan = escrituras.find(e => e.tabla === 'aseo_planes');
const enviado = wPlan?.cuerpo?.[0] || {};
revisar(JSON.stringify(enviado.reuniones) === '[{"dia":4,"hora":"19:30"},{"dia":0,"hora":"10:00"}]' && enviado.orden_grupos?.join(',') === '12,11,13' && enviado.inicio === A.lunesDe(HOY) && enviado.congregacion_id === 'c1' && enviado.avisos === true,
  `guardar planeación: ${JSON.stringify(enviado)}`);
revisar(/on_conflict=congregacion_id/.test(wPlan?.url || ''), 'planeación: una por congregación (upsert)');
let semanas = await filasSemana();
revisar(semanas.length === 8 && semanas[0].txt.includes('Esta semana') && semanas[0].txt.includes('Grupo Hidalgo') && semanas[1].txt.includes('Grupo Juárez') && semanas[2].txt.includes('Grupo Morelos') && semanas[3].txt.includes('Grupo Hidalgo'),
  `próximas 8 semanas, recurrente (${semanas.slice(0, 4).map(x => x.txt.slice(0, 40)).join(' | ')})`);
txt = await texto();
revisar(txt.includes('7:30 p. m.') && txt.includes('Avisos activos'), 'muestra los días y la hora de las reuniones y si avisa');
revisar(await sinScroll(), 'Grupos 1280px: sin scroll horizontal');
await page.screenshot({ path: `${OUT}/aseo-grupos-1280.png`, fullPage: true });

// Cambiar la semana 2: sin aseo
await page.evaluate((l) => document.querySelector(`[data-semana="${l}"] button[aria-label="Cambiar esta semana"]`)?.click(), semanas[1].lunes);
await hastaQue(page, () => !!document.querySelector('select option[value="sin"]'));
await page.select('select:has(option[value="sin"])', 'sin');
await escribir(page, 'input[maxlength="200"]', 'Asamblea de circuito');
await clicTexto('Guardar');
await hastaQueNode(() => escrituras.some(e => e.tabla === 'aseo_cambios'));
await hastaQue(page, (l) => document.querySelector(`[data-semana="${l}"]`)?.innerText.includes('Sin aseo'), semanas[1].lunes);
const wCambio = escrituras.find(e => e.tabla === 'aseo_cambios')?.cuerpo?.[0] || {};
revisar(wCambio.sin_aseo === true && wCambio.grupo_id === null && wCambio.semana === semanas[1].lunes && wCambio.nota === 'Asamblea de circuito', `cambio de semana guardado (${JSON.stringify(wCambio)})`);
semanas = await filasSemana();
revisar(semanas[1].txt.includes('Sin aseo') && semanas[1].txt.includes('Cambio') && semanas[2].txt.includes('Grupo Morelos'), 'esa semana dice "Sin aseo"; las demás siguen igual');
// Quitar el cambio
await page.evaluate((l) => document.querySelector(`[data-semana="${l}"] button[aria-label="Cambiar esta semana"]`)?.click(), semanas[1].lunes);
await hastaQue(page, () => document.body.innerText.includes('Quitar cambio'));
await clicTexto('Quitar cambio');
await hastaQue(page, (l) => document.querySelector(`[data-semana="${l}"]`)?.innerText.includes('Grupo Juárez'), semanas[1].lunes);
revisar(escrituras.some(e => e.metodo === 'DELETE' && e.tabla === 'aseo_cambios') && (await filasSemana())[1].txt.includes('Grupo Juárez'), 'quitar cambio: vuelve a la rotación');
// Vista previa
await clicTexto('Así les llegará');
await hastaQue(page, () => document.body.innerText.includes('Porque Dios no es un Dios de desorden'));
txt = await texto();
revisar(txt.includes('Porque Dios no es un Dios de desorden, sino de paz.') && txt.includes('tienen el increíble privilegio de realizar el aseo del Salón del Reino'), 'vista previa: así les llegará');
await page.screenshot({ path: `${OUT}/aseo-vista-previa-1280.png` });
await clicTexto('¡Ahí estaremos!');
await espera(300);

// Móvil y modo oscuro
for (const tema of ['light', 'dark']) {
  await page.evaluateOnNewDocument((x) => localStorage.setItem('theme', x), tema);
  await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/grupos`, { waitUntil: 'networkidle2' });
  await hastaQue(page, () => document.querySelectorAll('[data-semana]').length === 8);
  revisar(await sinScroll(), `Grupos 360px (${tema}): sin scroll horizontal`);
  await page.evaluate(() => document.querySelector('[data-aseo]')?.scrollIntoView());
  await page.screenshot({ path: `${OUT}/aseo-grupos-360-${tema}.png` });
}
await page.evaluateOnNewDocument(() => localStorage.setItem('theme', 'light'));
await clicTexto('Editar planeación');
await hastaQue(page, () => document.body.innerText.includes('Orden de la rotación'));
revisar(await sinScroll(), 'planeación 360px: sin scroll horizontal');
await espera(500); // que termine la animación del modal
await page.screenshot({ path: `${OUT}/aseo-planeacion-360.png` });

// Sin la Migración 17: avisa y Grupos sigue funcionando
sinMigracion = true;
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/grupos`, { waitUntil: 'networkidle2' });
await hastaQue(page, () => document.body.innerText.includes('Migración 17'));
txt = await texto();
revisar(txt.includes('Migración 17') && txt.includes('Publicadores por grupo') && txt.includes('Grupo Juárez'), 'sin la Migración 17: avisa y lo demás de Grupos funciona');
sinMigracion = false;

// ── La ventana del aviso (publicador) ──
const manana = hoyLocal(new Date(Date.now() + 86400000));
const ayer = hoyLocal(new Date(Date.now() - 86400000));
tabla.notificaciones = [
  { id: 51, usuario_destino_id: 3, tipo: 'sistema', titulo: 'viejo', mensaje: '', leida: false, created_at: '2026-01-01T00:00:00Z', metadata: { tipo: 'aseo', grupo: 'Grupo Juárez', fecha: ayer, hora: '19:30', cuando: 'manana' } },
  { id: 50, usuario_destino_id: 3, tipo: 'sistema', titulo: '🧹 Grupo Juárez: aseo del Salón mañana', mensaje: 'x', leida: false, created_at: '2026-01-02T00:00:00Z', metadata: { tipo: 'aseo', grupo: 'Grupo Juárez', fecha: manana, hora: '19:30', cuando: 'manana', color: '#10B981' } },
];
const page2 = page;
await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await entrarComo(3);
await page2.goto(`${BASE}/profile`, { waitUntil: 'networkidle2' });
const salio = await hastaQue(page2, () => !!document.querySelector('[data-aviso-aseo]'));
await espera(500);
txt = await texto();
revisar(salio && txt.includes('Porque Dios no es un Dios de desorden, sino de paz.') && !/Corintios|14:33/.test(txt) && txt.includes('¡Grupo Juárez, tienen el increíble privilegio') && txt.includes('7:30 p. m.') && txt.includes('Mañana'),
  'publicador: al abrir la app sale la ventana del aseo con el versículo (solo el texto, sin cita)');
revisar(await sinScroll(), 'ventana del aviso 390px: sin scroll horizontal');
await page2.screenshot({ path: `${OUT}/aseo-aviso-390.png` });
await clicTexto('¡Ahí estaremos!');
await hastaQue(page2, () => !document.querySelector('[data-aviso-aseo]'));
await hastaQueNode(() => escrituras.some(e => e.tabla === 'notificaciones' && e.metodo === 'PATCH'));
const marcada = escrituras.find(e => e.tabla === 'notificaciones' && e.metodo === 'PATCH');
revisar(!!marcada && marcada.url.includes('id=eq.50') && marcada.cuerpo.leida === true, 'al cerrarla queda leída (no vuelve a salir)');
await espera(800);
revisar(!(await page2.evaluate(() => !!document.querySelector('[data-aviso-aseo]'))), 'el aviso de una fecha que ya pasó no sale');
await page2.reload({ waitUntil: 'networkidle2' });
await espera(1500);
revisar(!(await page2.evaluate(() => !!document.querySelector('[data-aviso-aseo]'))), 'al volver a abrir: ya no sale');
// En inglés
tabla.notificaciones.find(n => n.id === 50).leida = false;
await entrarComo(3, { app_lang: 'en' });
await page2.goto(`${BASE}/profile`, { waitUntil: 'networkidle2' });
await hastaQue(page2, () => !!document.querySelector('[data-aviso-aseo]'));
txt = await texto();
revisar(txt.includes('For God is a God not of disorder but of peace.') && !/Corinthians|14:33/.test(txt) && txt.includes("We'll be there!"), 'en inglés también');

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
