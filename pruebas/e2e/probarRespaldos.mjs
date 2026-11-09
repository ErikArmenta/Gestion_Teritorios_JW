// 5) Respaldos automáticos (función REAL `respaldo`) y 7) errores de la app (reporte + pantalla amable + Backup).
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import zlib from 'zlib';
import * as jose from 'jose';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const SECRETO_SESION = 'secreto-legacy-de-prueba-con-mas-de-32-caracteres';
const { handler: respaldo, db } = await cargarFuncion(`${RAIZ}/supabase/functions/respaldo/index.ts`, {
  SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', RESPALDO_SECRETO: 'cron-secreto-123', SESION_JWT_SECRET: SECRETO_SESION,
});
const token = (usuarioId) => new jose.SignJWT({ role: 'anon', usuario_id: usuarioId }).setProtectedHeader({ alg: 'HS256' })
  .setIssuer('gestion-territorial').setIssuedAt().setExpirationTime('1d').sign(new TextEncoder().encode(SECRETO_SESION));
db.app_usuarios = [
  { id: 1, nombre: 'Súper', rol: 'Super Admin', activo: true, password: null, password_hash: 'h:x' },
  { id: 2, nombre: 'Admin', rol: 'Admin Principal', activo: true },
  { id: 3, nombre: 'Ex súper', rol: 'Super Admin', activo: false },
];
db.congregaciones = [{ id: 'c1', nombre: 'Centro' }];
db.casas = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, territorio_id: 1, direccion: `Calle ${i}` }));
db.territorios = [{ id: 1, nombre: 'Norte' }];
delete db.exhibidores; // tabla opcional que no existe → se omite sin fallar
const llamar = async (cuerpo, cab = {}) => {
  const r = await respaldo(new Request('https://x/f', { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) }));
  return { status: r.status, body: await r.json() };
};

// ── 5) Función respaldo ──
let r = await llamar({ accion: 'crear' });
revisar(r.status === 403, 'crear sin secreto ni token → rechazado');
r = await llamar({ accion: 'crear' }, { 'x-respaldo-secreto': 'otro' });
revisar(r.status === 403, 'secreto equivocado → rechazado');
r = await llamar({ accion: 'crear', token: await token(2) });
revisar(r.status === 403, 'Admin Principal (no Super Admin) → rechazado');
r = await llamar({ accion: 'crear', token: await token(3) });
revisar(r.status === 403, 'Super Admin desactivado → rechazado');
const falso = await new jose.SignJWT({ role: 'anon', usuario_id: 1 }).setProtectedHeader({ alg: 'HS256' }).setIssuer('gestion-territorial').setExpirationTime('1d').sign(new TextEncoder().encode('otra-llave-de-un-atacante-con-32-caracteres'));
r = await llamar({ accion: 'crear', token: falso });
revisar(r.status === 403, 'token falsificado → rechazado');
r = await llamar({ accion: 'crear' }, { 'x-respaldo-secreto': 'cron-secreto-123' });
revisar(r.status === 200 && /^respaldo_\d{4}-\d{2}-\d{2}_\d{4}\.json\.gz$/.test(r.body.nombre) && r.body.filas.casas === 2500, `pg_cron (secreto): respaldo creado ${r.body.nombre} (${r.body.filas?.casas} casas, paginado de 1000 en 1000)`);
revisar(!('exhibidores' in (r.body.filas || {})), 'tabla que no existe: se omite sin fallar');
const guardado = db.storage.respaldos[r.body.nombre];
const contenido = JSON.parse(zlib.gunzipSync(Buffer.from(guardado.datos)).toString());
revisar(contenido.datos.casas.length === 2500 && contenido.datos.app_usuarios[0].password_hash === 'h:x' && contenido.metadata.version === 2, 'el archivo es gzip con todas las tablas (incluye los hashes para poder restaurar cuentas)');
revisar(!Object.keys(contenido.datos).some(t => /webauthn|login_intentos|seguridad_config|errores_app/.test(t)), 'no respalda tablas internas (huellas, intentos, config, errores)');
// Conservar 12
for (let i = 0; i < 14; i++) db.storage.respaldos[`respaldo_2025-01-${String(i + 1).padStart(2, '0')}_0300.json.gz`] = { bytes: 10, created_at: '2025-01-01' };
await llamar({ accion: 'crear', token: await token(1) });
revisar(Object.keys(db.storage.respaldos).length === 12, `Super Admin "Respaldar ahora" y solo se conservan 12 (${Object.keys(db.storage.respaldos).length})`);
r = await llamar({ accion: 'listar', token: await token(1) });
revisar(r.status === 200 && r.body.respaldos.length === 12 && r.body.respaldos[0].nombre > r.body.respaldos[11].nombre, 'listar: 12, el más nuevo primero');
r = await llamar({ accion: 'listar', token: await token(2) });
revisar(r.status === 403, 'listar: solo Super Admin');
r = await llamar({ accion: 'descargar', token: await token(1), nombre: '../../etc/passwd' });
revisar(r.status === 400, 'descargar: nombre raro → rechazado');
const nombre = Object.keys(db.storage.respaldos).sort().pop();
r = await llamar({ accion: 'descargar', token: await token(1), nombre });
revisar(r.status === 200 && r.body.url.includes(nombre) && r.body.url.includes('t=120'), 'descargar: link firmado de 2 minutos');

// ── 7) App: reporte de errores, pantalla amable y Backup ──
const rpcs = [];
const parches = [];
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message.slice(0, 120)}`));
await page.setRequestInterception(true);
let casasMalas = false;
const erroresBD = [
  { id: 1, mensaje: 'Cannot read properties of undefined (reading \'map\')', pila: 'TypeError: …\n at Informes (index.js:1)', ruta: '/informes', navegador: 'Android Chrome', version: 'abc123', veces: 7, primera_vez: '2026-11-01T10:00:00Z', ultima_vez: new Date().toISOString(), resuelto: false, app_usuarios: { nombre: 'Ana López' } },
  { id: 2, mensaje: '<img src=x onerror=window.__xss=1>', pila: null, ruta: '/', navegador: 'iPhone', version: 'abc123', veces: 1, primera_vez: '2026-11-05T10:00:00Z', ultima_vez: '2026-11-05T10:00:00Z', resuelto: false, app_usuarios: null },
];
page.on('request', async (req) => {
  const url = req.url();
  if (!url.includes('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const u = new URL(url);
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname === '/functions/v1/respaldo') {
    const res = await respaldo(new Request('https://x/f', { method: 'POST', body: req.postData() }));
    return req.respond({ status: res.status, headers: { ...cors, 'Content-Type': 'application/json' }, body: await res.text() });
  }
  if (u.pathname.startsWith('/functions/')) return json(404, {});
  if (u.pathname.endsWith('/rpc/reportar_error')) { rpcs.push(JSON.parse(req.postData())); return json(204, null); }
  if (req.method() === 'PATCH') { parches.push(`${u.pathname}${decodeURIComponent(u.search)} ${req.postData()}`); return json(204, null); }
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  const tabla = u.pathname.split('/').pop();
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  let datos = [];
  if (tabla === 'errores_app') datos = erroresBD;
  if (tabla === 'territorios') datos = [{ id: 1, nombre: 'Norte', congregacion_id: 'c1', coordenadas: [[19.4, -99.1], [19.41, -99.1], [19.41, -99.09]] }];
  if (tabla === 'casas' && casasMalas) datos = [{ id: 1, territorio_id: 1, territorio_nombre: 'Norte', direccion: { roto: true }, estado: 'Pendiente', latitud: 19.4, longitud: -99.1 }];
  if (tabla === 'congregaciones') datos = [{ id: 'c1', nombre: 'Centro' }];
  return json(200, objeto ? (datos[0] || {}) : datos);
});
const tok = await token(1);
await page.evaluateOnNewDocument((tk) => {
  try {
    localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Súper', usuario: 's', rol: 'Super Admin', congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
    localStorage.setItem('territorial_token', JSON.stringify({ token: tk, expira: Math.floor(Date.now() / 1000) + 86400, obtenido: Date.now() }));
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  } catch { /* */ }
}, tok);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1200); };
const texto = () => page.evaluate(() => document.body.innerText);

// Error suelto (fuera de React) → se reporta una vez aunque pase 3 veces
await ir('/profile');
// Como un error real de la app: desde un <script> de la misma página (un error inyectado por la prueba
// llega como "Script error." sin detalles, y ese ruido se ignora a propósito)
const inyectar = (codigo) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); }, codigo);
await inyectar("for (var i = 0; i < 3; i++) setTimeout(function () { throw new Error('Prueba de error suelto'); }, 10 * i);");
await inyectar("setTimeout(function () { Promise.reject(new Error('Promesa sin catch de prueba')); }, 50);");
await espera(800);
const sueltos = rpcs.filter(x => x.p_mensaje === 'Prueba de error suelto');
revisar(sueltos.length === 1 && /^e[a-z0-9]+$/.test(sueltos[0].p_firma) && sueltos[0].p_ruta === '/profile' && sueltos[0].p_version, `error suelto: reportado 1 vez (de 3), con firma, ruta y versión (${JSON.stringify(sueltos[0] || {}).slice(0, 120)})`);
revisar(rpcs.some(x => x.p_mensaje === 'Promesa sin catch de prueba'), 'promesa rechazada sin catch: reportada');
// Pantalla que truena → aviso amable, no pantalla en blanco
casasMalas = true;
await ir('/list');
let t = await texto();
revisar(t.includes('Algo salió mal en esta pantalla') && t.includes('Intentar de nuevo') && t.includes('Ir al inicio'), 'pantalla que truena: aviso amable en vez de pantalla en blanco');
await espera(500);
revisar(rpcs.some(x => /toLowerCase is not a function|Objects are not valid as a React child|Minified React error/.test(x.p_mensaje) && /at |in /.test(x.p_pila || '')), `el error de la pantalla se reporta con la pila (${rpcs.map(x => x.p_mensaje.slice(0, 50)).join(' | ')})`);
await page.screenshot({ path: `${OUT}/error-pantalla.png` });
casasMalas = false;
// Ir a otra pantalla: el aviso se quita solo
await page.evaluate(() => { history.pushState({}, '', '/profile'); dispatchEvent(new PopStateEvent('popstate')); });
await espera(800);
t = await texto();
revisar(!t.includes('Algo salió mal') && t.includes('Mi Perfil'), 'al cambiar de pantalla el aviso se quita');

// Backup: respaldos y errores
await ir('/backup');
t = await texto();
revisar(t.includes('Respaldos automáticos') && t.includes('Respaldar ahora') && (t.match(/Descargar/g) || []).length >= 12, 'Backup: lista de respaldos con "Descargar" y "Respaldar ahora"');
revisar(t.includes('Errores de la app') && t.includes('7×') && t.includes('Ana López') && t.includes('<img src=x onerror=window.__xss=1>') && !(await page.evaluate(() => window.__xss)), 'Backup: errores agrupados (7×, quién) y el texto del teléfono se muestra como texto (sin XSS)');
revisar(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Backup 390px: sin scroll horizontal');
await page.screenshot({ path: `${OUT}/backup-390.png`, fullPage: true });
await page.evaluate(() => [...document.querySelectorAll('button[title="Marcar como resuelto"]')][0]?.click());
await espera(600);
revisar(parches.some(p => p.includes('errores_app?id=eq.1') && p.includes('"resuelto":true')), 'marcar como resuelto: se guarda');
revisar(!(await texto()).includes('7×'), 'el resuelto sale de la lista');
const n0 = Object.keys(db.storage.respaldos).length;
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Respaldar ahora'))?.click());
await espera(1500);
revisar((await texto()).includes('Respaldo guardado'), `"Respaldar ahora" desde la app: guardado (${n0} → ${Object.keys(db.storage.respaldos).length})`);

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
