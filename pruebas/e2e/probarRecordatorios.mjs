// 10) Recordatorios (función REAL `recordatorios` en Node con Supabase falso y OneSignal interceptado):
// qué toca cada día, a quién, sin repetir, permisos, y la vista previa en Backup.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import * as jose from 'jose';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const SECRETO_SESION = 'secreto-legacy-de-prueba-con-mas-de-32-caracteres';
const entorno = { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', RESPALDO_SECRETO: 'cron-123', SESION_JWT_SECRET: SECRETO_SESION, ONESIGNAL_APP_ID: 'app', ONESIGNAL_REST_API_KEY: 'key', APP_URL: 'https://app.local' };
const { handler, db } = await cargarFuncion(`${RAIZ}/supabase/functions/recordatorios/index.ts`, entorno);
const token = (id) => new jose.SignJWT({ role: 'anon', usuario_id: id }).setProtectedHeader({ alg: 'HS256' }).setIssuer('gestion-territorial').setExpirationTime('1d').sign(new TextEncoder().encode(SECRETO_SESION));

// OneSignal falso: lo que se mandaría
const pushes = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.onesignal.com/')) { pushes.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); }
  return fetchReal(url, init);
};
const reiniciar = () => {
  db.app_usuarios = [
    { id: 1, nombre: 'Súper', rol: 'Super Admin', activo: true, congregacion_id: 'c1' },
    { id: 2, nombre: 'Anciano A', rol: 'Anciano', activo: true, congregacion_id: 'c1' },
    { id: 3, nombre: 'Pub A', rol: 'Publicador', activo: true, congregacion_id: 'c1' },
    { id: 4, nombre: 'Pub B', rol: 'Publicador', activo: true, congregacion_id: 'c2' },
    { id: 5, nombre: 'Inactivo', rol: 'Publicador', activo: false, congregacion_id: 'c1' },
    { id: 6, nombre: 'Admin B', rol: 'Admin Principal', activo: true, congregacion_id: 'c2' },
  ];
  db.informes_servicio = [
    { id: 1, usuario_id: 3, mes: '2026-10-01', enviado_en: '2026-10-31T20:00:00Z' },
    { id: 2, usuario_id: 4, mes: '2026-10-01', enviado_en: null }, // guardado pero no enviado → sí se le recuerda
  ];
  db.exhibidor_turnos = [
    { id: 10, usuario_id: 3, fecha: '2026-11-02', hora_inicio: '09:00:00', hora_fin: '11:00:00', estado: 'aceptado', exhibidores: { nombre: 'Plaza Mitla' } },
    { id: 11, usuario_id: 4, fecha: '2026-11-02', hora_inicio: '12:00:00', hora_fin: '13:00:00', estado: 'rechazado', exhibidores: { nombre: 'Mercado' } },
    { id: 12, usuario_id: 2, fecha: '2026-11-03', hora_inicio: '09:00:00', hora_fin: '10:00:00', estado: 'pendiente', exhibidores: { nombre: 'Plaza Mitla' } },
  ];
  db.territorios = [
    { id: 1, numero: '1', nombre: 'Centro', congregacion_id: 'c1' }, { id: 2, numero: '2', nombre: 'Norte', congregacion_id: 'c1' },
    { id: 3, numero: '3', nombre: 'Sur', congregacion_id: 'c1' }, { id: 4, numero: '1', nombre: 'B-Uno', congregacion_id: 'c2' },
  ];
  db.territorio_trabajos = [
    { id: 1, territorio_id: 1, estado: 'completado', fecha_fin: '2026-01-10' },  // > 4 meses → olvidado
    { id: 2, territorio_id: 2, estado: 'en_progreso', fecha_fin: null },        // en progreso → no
    { id: 3, territorio_id: 4, estado: 'completado', fecha_fin: '2026-10-20' }, // reciente → no
  ];                                                                            // 3 · Sur: nunca → olvidado
  db.recordatorios_enviados = [];
  db.notificaciones = [];
  pushes.length = 0;
};
const llamar = async (cuerpo, cab = {}) => {
  const r = await handler(new Request('https://x/f', { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) }));
  return { status: r.status, body: await r.json() };
};
const cron = (hoy) => llamar({ accion: 'enviar', hoy }, { 'x-cron-secreto': 'cron-123' });
const destinatarios = (filtro) => pushes.filter(filtro).flatMap(p => p.include_aliases.external_id).sort().join(',');

// Permisos
reiniciar();
revisar((await llamar({ accion: 'enviar' })).status === 403, 'enviar sin secreto → rechazado');
revisar((await llamar({ accion: 'enviar' }, { 'x-cron-secreto': 'otro' })).status === 403, 'secreto equivocado → rechazado');
revisar((await llamar({ accion: 'vista_previa', token: await token(3) })).status === 403, 'vista previa: un publicador no puede');
delete db.recordatorios_enviados;
revisar((await cron('2026-11-01')).body.error === 'falta_migracion_16' && pushes.length === 0, 'sin la Migración 16 no manda nada (se repetirían)');

// 1 de noviembre (domingo): informe de octubre + turnos del 2
reiniciar();
let r = await cron('2026-11-01');
revisar(r.status === 200 && r.body.informe.mes === '2026-10-01', `día 1: recordatorio del informe de OCTUBRE (${r.body.informe?.mes})`);
revisar(destinatarios(p => p.url.endsWith('/informes')) === '1,2,4,6', `informe: a quien no ha enviado (no a Pub A que ya envió, ni al inactivo) → ${destinatarios(p => p.url.endsWith('/informes'))}`);
const pInf = pushes.find(p => p.url.endsWith('/informes'));
revisar(pInf.contents.es.includes('octubre') && pInf.contents.en.includes('October') && pInf.url === 'https://app.local/informes', 'informe: texto en español e inglés y abre Informes');
revisar(destinatarios(p => p.url.endsWith('/exhibidores')) === '3', 'turno de mañana: solo el aceptado (no el rechazado)');
revisar(pushes.find(p => p.url.endsWith('/exhibidores')).contents.es === 'Plaza Mitla, de 09:00 a 11:00.', 'turno: exhibidor y horario');
revisar(!pushes.some(p => p.url.endsWith('/grupos')), 'domingo: no hay aviso de territorios');
revisar(r.body.enviados === 5 && db.recordatorios_enviados.length === 5, `quedan anotados (${db.recordatorios_enviados.length})`);
// Otra vez el mismo día (pg_cron reintenta) → nada nuevo
pushes.length = 0;
r = await cron('2026-11-01');
revisar(pushes.length === 0 && r.body.yaEnviados === 5 && r.body.porEnviar === 0, 'el mismo día otra vez: no repite');
// Día 2: se vuelve a recordar el informe (otro día), pero no los turnos ya avisados
pushes.length = 0;
r = await cron('2026-11-02');
revisar(destinatarios(p => p.url.endsWith('/informes')) === '1,2,4,6' && destinatarios(p => p.url.endsWith('/exhibidores')) === '2', 'día 2: informe otra vez + el turno del día 3');
// Lunes 9: territorios olvidados a ancianos/admins de su congregación
pushes.length = 0;
r = await cron('2026-11-09');
revisar(r.body.informe.mes === null && !pushes.some(p => p.url.endsWith('/informes')), 'día 9: no toca informe');
revisar(destinatarios(p => p.url.endsWith('/grupos')) === '2', `lunes: territorios olvidados al anciano de A (B no tiene) → ${destinatarios(p => p.url.endsWith('/grupos'))}`);
const pTerr = pushes.find(p => p.url.endsWith('/grupos'));
revisar(pTerr.headings.es === '🗺️ 2 territorios sin trabajar' && pTerr.contents.es.includes('1, 3'), `territorios: "1, 3" (el 1 viejo y el 3 nunca) — ${pTerr.contents.es}`);
pushes.length = 0;
await cron('2026-11-09');
revisar(pushes.length === 0, 'el mismo lunes otra vez: no repite');
// Último día del mes: informe del mes en curso
reiniciar();
r = await cron('2026-11-30');
revisar(r.body.informe.mes === '2026-11-01' && destinatarios(p => p.url.endsWith('/informes')) === '1,2,3,4,6', 'último día del mes: informe de NOVIEMBRE a todos los activos');
// Sin OneSignal configurado: no truena, avisa
const sinOS = await cargarFuncion(`${RAIZ}/supabase/functions/recordatorios/index.ts`, { ...entorno, ONESIGNAL_APP_ID: '', ONESIGNAL_REST_API_KEY: '' });
reiniciar();
const rs = await sinOS.handler(new Request('https://x/f', { method: 'POST', headers: { 'x-cron-secreto': 'cron-123' }, body: '{"accion":"enviar","hoy":"2026-11-01"}' }));
const bs = await rs.json();
revisar(bs.sinOneSignal === true && bs.enviados === 0 && db.recordatorios_enviados.length === 0, 'sin OneSignal: no manda ni anota (se mandarán cuando se configure)');
// Vista previa (Super Admin): no manda
const { handler: h2 } = await cargarFuncion(`${RAIZ}/supabase/functions/recordatorios/index.ts`, entorno);
reiniciar();
const vp = await h2(new Request('https://x/f', { method: 'POST', body: JSON.stringify({ accion: 'vista_previa', token: await token(1), hoy: '2026-11-01' }) }));
const bvp = await vp.json();
revisar(vp.status === 200 && bvp.porEnviar === 5 && bvp.enviados === 0 && pushes.length === 0 && db.recordatorios_enviados.length === 0, 'vista previa: dice a quién, sin mandar ni anotar');

// ── Backup: "Ver quién recibiría hoy" ──
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
page.on('request', async (req) => {
  const u = new URL(req.url());
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  if (u.pathname === '/functions/v1/recordatorios') {
    reiniciar();
    const res = await h2(new Request('https://x/f', { method: 'POST', body: req.postData() }));
    return req.respond({ status: res.status, headers: { ...cors, 'Content-Type': 'application/json' }, body: await res.text() });
  }
  if (u.pathname.startsWith('/functions/')) return req.respond({ status: 404, headers: cors, body: '{}' });
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: '[]' });
});
const tk = await token(1);
await page.evaluateOnNewDocument((t) => {
  try {
    localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Súper', usuario: 's', rol: 'Super Admin', congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
    localStorage.setItem('territorial_token', JSON.stringify({ token: t, expira: Math.floor(Date.now() / 1000) + 86400, obtenido: Date.now() }));
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  } catch { /* marco sin storage */ }
}, tk);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(`${BASE}/backup`, { waitUntil: 'networkidle2' });
await espera(1200);
let t = await page.evaluate(() => document.body.innerText);
revisar(t.includes('Recordatorios automáticos'), 'Backup: sección de recordatorios');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Ver quién los recibiría hoy'))?.click());
await espera(1500);
t = await page.evaluate(() => document.body.innerText);
revisar(/Por mandar hoy:\s*\d+/.test(t), `vista previa en la app (${(t.match(/Por mandar hoy:\s*\d+/) || [''])[0]})`);
revisar(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Backup 390px: sin scroll horizontal');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Mandarme una prueba'))?.click());
await page.waitForSelector('[data-prueba-recordatorios]', { timeout: 20000 }).catch(() => null);
t = await page.evaluate(() => document.querySelector('[data-prueba-recordatorios]')?.innerText || '');
revisar(t.includes('Push directo enviado') && t.includes('Aviso del aseo guardado'), `Backup: "Mandarme una prueba" dice cómo le fue a cada camino ("${t.replace(/\s+/g, ' ').slice(0, 120)}")`);
await page.screenshot({ path: `${OUT}/recordatorios-backup-390.png`, fullPage: true });
await browser.close();

console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
