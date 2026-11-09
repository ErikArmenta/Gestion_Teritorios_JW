// Blindaje paso 2: contraseñas cifradas. Funciones REALES (sesion, webauthn) en Node con Supabase falso
// (+ verificar_password simulado), y la app real en el navegador (Mi Perfil y Usuarios).
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const base = { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x' };
const { handler: sesion } = await cargarFuncion(`${RAIZ}/supabase/functions/sesion/index.ts`, base);
const { handler: webauthn, db } = await cargarFuncion(`${RAIZ}/supabase/functions/webauthn/index.ts`, base);
const ORIGEN = 'http://localhost:4173';
const llamar = async (fn, cuerpo) => {
  const r = await fn(new Request('https://x/f', { method: 'POST', headers: { origin: ORIGEN, apikey: 'sb_publishable_x' }, body: JSON.stringify(cuerpo) }));
  return { status: r.status, body: await r.json() };
};
const reiniciar = (cifradas) => {
  db.app_usuarios = [
    { id: 7, usuario: 'dani', nombre: 'Daniel', password: cifradas ? null : '1234', password_hash: cifradas ? 'h:1234' : null, rol: 'Admin Principal', congregacion_id: 'c1', activo: true, created_at: '2026-01-01' },
    { id: 8, usuario: 'ana', nombre: 'Ana', password: cifradas ? null : 'secreta', password_hash: cifradas ? 'h:secreta' : null, rol: 'Publicador', congregacion_id: 'c1', activo: true, created_at: '2026-01-02' },
  ];
  db.congregaciones = [{ id: 'c1', nombre: 'Centro' }];
  db.webauthn_credenciales = []; db.webauthn_retos = [];
};

// ── Servidor ──
for (const modo of ['sin Migración 11', 'fase 1 (cifrada + original)', 'fase 2 (solo cifrada)']) {
  reiniciar(modo.startsWith('fase 2'));
  db.sinMigracion11 = modo.startsWith('sin');
  if (modo.startsWith('fase 1')) db.app_usuarios.forEach(u => { u.password_hash = 'h:' + u.password; });
  let r = await llamar(sesion, { accion: 'entrar', usuario: 'dani', password: '1234' });
  revisar(r.status === 200 && r.body.usuario?.id === 7 && !('password' in r.body.usuario) && !('password_hash' in r.body.usuario), `${modo}: entra con la contraseña correcta`);
  r = await llamar(sesion, { accion: 'entrar', usuario: 'dani', password: 'secreta' });
  revisar(r.status === 401 && r.body.error === 'credenciales', `${modo}: la contraseña de otro no sirve`);
  r = await llamar(sesion, { accion: 'entrar', usuario: 'dani', password: '' });
  revisar(r.status === 401, `${modo}: contraseña vacía no entra`);
  // Cambiar contraseña
  r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: 'mala', nueva: 'nueva99' });
  revisar(r.status === 401 && db.app_usuarios[0].password !== 'nueva99', `${modo}: cambiar con la actual mala → rechazado`);
  r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: '1234', nueva: 'abc' });
  revisar(r.status === 400 && r.body.error === 'muy_corta', `${modo}: nueva muy corta → rechazada`);
  r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 7, actual: '1234', nueva: 'nueva99' });
  revisar(r.status === 200 && db.app_usuarios[0].password === 'nueva99', `${modo}: cambio correcto (la BD la cifra con el disparador)`);
  r = await llamar(sesion, { accion: 'cambiar-password', usuario_id: 8, actual: '1234', nueva: 'robada1' });
  revisar(r.status === 401 && db.app_usuarios[1].password !== 'robada1', `${modo}: no puedes cambiar la de otro con tu contraseña`);
  // Activar huella pide la contraseña (cifrada o no)
  db.app_usuarios[0].password = modo.startsWith('fase 2') ? null : '1234';
  if (!modo.startsWith('sin')) db.app_usuarios[0].password_hash = 'h:1234';
  r = await llamar(webauthn, { accion: 'registro-opciones', usuario_id: 7, password: '1234' });
  revisar(r.status === 200 && r.body.reto_id, `${modo}: activar huella con la contraseña correcta`);
  r = await llamar(webauthn, { accion: 'registro-opciones', usuario_id: 7, password: 'mala' });
  revisar(r.status === 401, `${modo}: activar huella con contraseña mala → rechazado`);
}
db.sinMigracion11 = false;

// ── App ──
reiniciar(true); // fase 2: nadie tiene texto plano
const escrituras = [];
const browser = await puppeteer.launch({
  executablePath: NAVEGADOR, headless: 'new',
  args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'],
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) logs.push('[console] ' + m.text().slice(0, 200)); });
await page.setRequestInterception(true);
page.on('request', async (req) => {
  const url = req.url();
  if (!url.includes('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const u = new URL(url);
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname.startsWith('/functions/v1/')) {
    const fn = u.pathname.endsWith('/sesion') ? sesion : webauthn;
    const r = await fn(new Request('https://x' + u.pathname, { method: 'POST', headers: { origin: BASE, apikey: req.headers().apikey || '' }, body: req.postData() }));
    return req.respond({ status: r.status, headers: { ...cors, 'Content-Type': 'application/json' }, body: await r.text() });
  }
  if (req.method() !== 'GET' && req.method() !== 'HEAD') {
    escrituras.push(`${req.method()} ${u.pathname}${decodeURIComponent(u.search)} ${req.postData() || ''}`);
    return json(200, []);
  }
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (u.pathname.endsWith('/app_usuarios')) return json(200, objeto ? db.app_usuarios[0] : db.app_usuarios);
  if (u.pathname.endsWith('/congregaciones')) return json(200, objeto ? db.congregaciones[0] : db.congregaciones);
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  return json(200, objeto ? {} : []);
});
const prep = async (ancho) => {
  await page.setViewport(ancho < 768 ? { width: ancho, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: ancho, height: 900 });
};
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('pwa_install_dismissed_at', String(Date.now())); sessionStorage.setItem('notif_banner_dismissed', 'true'); } catch { /* */ }
});
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1200); };
const texto = () => page.evaluate(() => document.body.innerText);
const clic = (txt) => page.evaluate((x) => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().includes(x)); b?.click(); return !!b; }, txt);
const tipear = async (sel, v) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); if (v) await page.type(sel, v); };

// Entrar con contraseña cifrada
await prep(390);
await ir('/login');
await page.type('input[autocomplete=username]', 'dani');
await page.type('input[type=password]', '1234');
await page.click('button[type=submit]');
await espera(2500);
revisar(!page.url().endsWith('/login'), 'app: entra con contraseña cifrada (fase 2)');

// Mi Perfil → cambiar contraseña por el servidor
await ir('/profile');
await tipear('input[placeholder="Ingresa tu contraseña actual"]', 'mala');
await tipear('input[placeholder="Mínimo 6 caracteres"]', 'nueva99');
await tipear('input[placeholder="Repite la nueva contraseña"]', 'nueva99');
await clic('Actualizar Contraseña');
await espera(1500);
revisar((await texto()).includes('La contraseña actual es incorrecta') && db.app_usuarios[0].password === null, 'perfil: actual mala → aviso, no cambia');
await tipear('input[placeholder="Ingresa tu contraseña actual"]', '1234');
await clic('Actualizar Contraseña');
await espera(1500);
revisar((await texto()).includes('Contraseña actualizada correctamente') && db.app_usuarios[0].password === 'nueva99', 'perfil: cambio por el servidor');
revisar(!escrituras.some(e => e.includes('password')), 'perfil: el navegador no escribe la contraseña directo en la tabla');
db.app_usuarios[0].password = null; db.app_usuarios[0].password_hash = 'h:nueva99';

// Usuarios: "Cifrada", editar sin contraseña no la manda
for (const ancho of [1280, 360]) {
  await prep(ancho);
  await ir('/users');
  const t = await texto();
  revisar(t.includes('Cifrada') && !t.includes('h:1234') && !t.includes('h:secreta'), `usuarios ${ancho}px: dice "Cifrada" y no muestra el hash`);
  await page.screenshot({ path: `${OUT}/usuarios-cifrada-${ancho}.png` });
}
await prep(1280);
await ir('/users');
const n0 = escrituras.length;
await clic('Editar');
await espera(800);
const ph = await page.evaluate(() => [...document.querySelectorAll('input')].find(i => i.placeholder.includes('vacía'))?.required);
revisar(ph === false, 'editar usuario: la contraseña no es obligatoria');
await page.screenshot({ path: `${OUT}/usuarios-editar.png` });
await page.evaluate(() => document.querySelector('form button[type=submit]')?.click());
await espera(1500);
const patch = escrituras.slice(n0).find(e => e.startsWith('PATCH /rest/v1/app_usuarios'));
revisar(!!patch && !patch.includes('"password"'), `editar sin escribir contraseña: no se manda (${patch?.slice(0, 140)})`);
// Editar escribiendo una nueva → sí se manda
const n1 = escrituras.length;
await clic('Editar');
await espera(800);
await page.type('input[placeholder="Déjala vacía para no cambiarla"]', 'reset1');
await page.evaluate(() => document.querySelector('form button[type=submit]')?.click());
await espera(1500);
const patch2 = escrituras.slice(n1).find(e => e.startsWith('PATCH /rest/v1/app_usuarios'));
revisar(!!patch2 && patch2.includes('"password":"reset1"'), 'editar con contraseña nueva: sí se manda');
// Alta: obligatoria
await clic('Nuevo');
await espera(600);
const req = await page.evaluate(() => [...document.querySelectorAll('input')].find(i => i.placeholder === 'Contraseña de acceso')?.required);
revisar(req === true, 'alta de usuario: la contraseña sigue siendo obligatoria');

await browser.close();
console.log('OK:\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
