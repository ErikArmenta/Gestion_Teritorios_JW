// Límite de intentos de login (Migración 13) en las funciones REALES `sesion` y `webauthn` + mensajes en la app
// + contraseñas nuevas de mínimo 6 + importar casas sin SheetJS (xlsx de la plantilla y CSV).
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import fs from 'fs';
import path from 'path';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const base = { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x' };
let { handler: sesion, db } = await cargarFuncion(`${RAIZ}/supabase/functions/sesion/index.ts`, base);
let { handler: webauthn } = await cargarFuncion(`${RAIZ}/supabase/functions/webauthn/index.ts`, base);
const reiniciar = (conTabla) => {
  db.app_usuarios = [
    { id: 7, usuario: 'dani', nombre: 'Daniel', password: null, password_hash: 'h:1234', rol: 'Admin Principal', congregacion_id: 'c1', activo: true },
    { id: 8, usuario: 'ana', nombre: 'Ana', password: null, password_hash: 'h:secreta', rol: 'Publicador', congregacion_id: 'c1', activo: true },
  ];
  db.congregaciones = [{ id: 'c1', nombre: 'Centro' }];
  db.webauthn_credenciales = []; db.webauthn_retos = [];
  if (conTabla) db.login_intentos = []; else delete db.login_intentos;
};
const llamar = async (fn, cuerpo, ip = '1.1.1.1') => {
  const r = await fn(new Request('https://x/f', { method: 'POST', headers: { origin: BASE, apikey: 'sb_publishable_x', 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: JSON.stringify(cuerpo) }));
  return { status: r.status, body: await r.json() };
};
const entrar = (usuario, password, ip) => llamar(sesion, { accion: 'entrar', usuario, password }, ip);

// 1) Sin la tabla (Migración 13 sin correr): nada se limita
reiniciar(false);
let r;
for (let i = 0; i < 8; i++) r = await entrar('dani', 'mala');
revisar(r.status === 401 && (await entrar('dani', '1234')).status === 200, 'sin Migración 13: no se bloquea (como hoy)');

// 2) Con la tabla (funciones recién cargadas: la tabla existe desde el inicio)
({ handler: sesion, db } = await cargarFuncion(`${RAIZ}/supabase/functions/sesion/index.ts`, base));
({ handler: webauthn } = await cargarFuncion(`${RAIZ}/supabase/functions/webauthn/index.ts`, base));
reiniciar(true);
const estados = [];
for (let i = 0; i < 6; i++) estados.push((await entrar('Dani ', 'mala')).status);
revisar(JSON.stringify(estados) === '[401,401,401,401,401,429]', `5 intentos malos → bloqueado al 6.º (${estados.join(',')})`);
r = await entrar('dani', '1234');
revisar(r.status === 429 && r.body.error === 'bloqueado' && r.body.segundos > 800 && r.body.segundos <= 900, `bloqueado: ni con la contraseña correcta, ${r.body.segundos} s`);
revisar((await entrar('ana', 'secreta', '1.1.1.1')).status === 200, 'otro usuario desde la misma IP sí entra');
revisar(db.login_intentos.find(x => x.clave === 'u:dani')?.fallos === 5, 'clave por usuario sin mayúsculas ni espacios');
// Se vence el bloqueo → vuelve a entrar y se limpia su contador
const fila = db.login_intentos.find(x => x.clave === 'u:dani');
fila.bloqueado_hasta = new Date(Date.now() - 1000).toISOString();
fila.primer_fallo = new Date(Date.now() - 20 * 60000).toISOString();
r = await entrar('dani', '1234');
revisar(r.status === 200 && !db.login_intentos.some(x => x.clave === 'u:dani'), 'pasado el bloqueo: entra y su contador se borra');
// 3 malos + 1 bueno → contador limpio (no se acumula para después)
for (let i = 0; i < 3; i++) await entrar('ana', 'x');
await entrar('ana', 'secreta');
revisar(!db.login_intentos.some(x => x.clave === 'u:ana'), 'entrar bien limpia los fallos del usuario');
// Por IP: 20 fallos con usuarios distintos → la IP se bloquea
reiniciar(true);
for (let i = 0; i < 20; i++) await entrar(`fulano${i}`, 'x', '9.9.9.9');
revisar((await entrar('ana', 'secreta', '9.9.9.9')).status === 429 && (await entrar('ana', 'secreta', '8.8.8.8')).status === 200, 'IP con 20 fallos bloqueada; desde otra IP sí entra');
// Cambiar contraseña: mínimo 6 y también con límite
reiniciar(true);
r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: '1234', nueva: '12345' });
revisar(r.status === 400 && r.body.error === 'muy_corta', 'contraseña nueva de 5 → rechazada (mínimo 6)');
r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: '1234', nueva: '123456' });
revisar(r.status === 200, 'contraseña nueva de 6 → aceptada');
db.app_usuarios[0].password_hash = 'h:1234'; db.app_usuarios[0].password = null;
for (let i = 0; i < 5; i++) await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: 'mala', nueva: 'nueva123' });
r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: '1234', nueva: 'nueva123' });
revisar(r.status === 429, 'cambiar contraseña: 5 fallos → bloqueado');
// Activar huella: mismo límite
reiniciar(true);
for (let i = 0; i < 5; i++) await llamar(webauthn, { accion: 'registro-opciones', usuario_id: 8, password: 'mala' });
r = await llamar(webauthn, { accion: 'registro-opciones', usuario_id: 8, password: 'secreta' });
revisar(r.status === 429 && r.body.error === 'bloqueado', 'activar huella: 5 fallos → bloqueado');

// ── App ──
reiniciar(true);
const browser = await puppeteer.launch({
  executablePath: NAVEGADOR, headless: 'new',
  args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'],
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
const escrituras = [];
const territorios = [{ id: 1, nombre: 'Norte', congregacion_id: 'c1', coordenadas: [[19.4, -99.1], [19.41, -99.1], [19.41, -99.09]] }, { id: 2, nombre: 'Peñasco Sur', congregacion_id: 'c1', coordenadas: [[19.42, -99.1], [19.43, -99.1], [19.43, -99.09]] }];
page.on('request', async (req) => {
  const url = req.url();
  if (!url.includes('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const u = new URL(url);
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname.startsWith('/functions/v1/')) {
    const fn = u.pathname.endsWith('/sesion') ? sesion : webauthn;
    const res = await fn(new Request('https://x' + u.pathname, { method: 'POST', headers: { origin: BASE, apikey: 'k', 'x-forwarded-for': '2.2.2.2' }, body: req.postData() }));
    return req.respond({ status: res.status, headers: { ...cors, 'Content-Type': 'application/json' }, body: await res.text() });
  }
  if (req.method() !== 'GET' && req.method() !== 'HEAD') { escrituras.push(`${req.method()} ${u.pathname} ${req.postData() || ''}`); return json(201, []); }
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  const tabla = u.pathname.split('/').pop();
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const datos = { territorios, congregaciones: db.congregaciones, app_usuarios: db.app_usuarios.map(({ password_hash, ...x }) => x) }[tabla] || [];
  return json(200, objeto ? (datos[0] || {}) : datos);
});
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('pwa_install_dismissed_at', String(Date.now())); sessionStorage.setItem('notif_banner_dismissed', 'true'); } catch { /* */ } });
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1000); };
const texto = () => page.evaluate(() => document.body.innerText);
await ir('/login');
for (let i = 0; i < 6; i++) {
  await page.$eval('input[autocomplete=username]', el => { el.value = ''; });
  await page.type('input[autocomplete=username]', 'dani');
  await page.$eval('input[type=password]', el => { el.value = ''; });
  await page.click('input[type=password]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input[type=password]', 'mala');
  await page.click('button[type=submit]');
  await espera(700);
}
const t1 = await texto();
revisar(/Demasiados intentos\. Espera 15 min/.test(t1) && !t1.includes('Usuario o contraseña incorrectos.') , 'login: muestra "Demasiados intentos. Espera 15 min…"');
await page.screenshot({ path: `${OUT}/intentos-login.png` });

// Mi Perfil: mínimo 6
reiniciar(true);
await page.evaluate(() => localStorage.setItem('territorial_user', JSON.stringify({ id: 7, nombre: 'Daniel', usuario: 'dani', rol: 'Admin Principal', congregacion_id: 'c1', congregacion_nombre: 'Centro' })));
await ir('/profile');
const ph = await page.evaluate(() => [...document.querySelectorAll('input[type=password]')].map(i => i.placeholder));
revisar(ph.includes('Mínimo 6 caracteres'), 'Mi Perfil: dice "Mínimo 6 caracteres"');
await page.type('input[placeholder="Ingresa tu contraseña actual"]', '1234');
await page.type('input[placeholder="Mínimo 6 caracteres"]', '12345');
await page.type('input[placeholder="Repite la nueva contraseña"]', '12345');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Actualizar Contraseña'))?.click());
await espera(800);
revisar((await texto()).includes('al menos 6 caracteres'), 'Mi Perfil: contraseña de 5 → aviso');

// Importar casas: la plantilla con formato (xlsx) y un CSV con ; comillas y acentos en ANSI
await page.setViewport({ width: 1280, height: 900 });
await ir('/list');
const plantilla = path.join(OUT, 'descargas', 'plantilla_casas.xlsx');
const csv = path.join(OUT, 'casas_prueba.csv');
const csvTexto = 'Dirección;Territorio;Estado;Contacto;Teléfono;Notas\r\n"Av. Juárez 10, int. 2";Peñasco Sur;Atendido;José Núñez;5512345678;"Dice ""volver"" mañana"\r\nCalle Sin Territorio 5;Inventado;Pendiente;;;\r\n';
fs.writeFileSync(csv, Buffer.from(csvTexto, 'latin1'));
const importar = async (archivo) => {
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar Excel'))?.click());
  await espera(500);
  const input = await page.$('input[type=file][accept*=".xlsx"]');
  await input.uploadFile(archivo);
  await espera(1500);
  return texto();
};
let t = await importar(plantilla);
revisar(t.includes('Calle Ejemplo 123') && /Importar 1 casa válida/.test(t), 'importar la plantilla .xlsx (sin SheetJS): lee la fila de ejemplo');
await page.keyboard.press('Escape');
await ir('/list');
t = await importar(csv);
revisar(t.includes('Av. Juárez 10, int. 2') && t.includes('José Núñez') && /Importar 1 casa válida/.test(t), 'importar CSV con ; comillas y acentos (ANSI): bien leído; la casa sin territorio válido se marca');
await page.screenshot({ path: `${OUT}/intentos-importar.png` });

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
