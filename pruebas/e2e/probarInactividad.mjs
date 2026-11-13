// Cierre de sesión por inactividad (components/AvisoInactividad.jsx, utils/inactividad.js): a los 14 min sin
// tocar la app sale "¿Sigues ahí?" con 60 s; "Sí, aquí sigo" renueva el token (función `sesion`, acción
// `renovar`); sin respuesta se cierra la sesión. Sin internet no se cierra. Para no esperar 15 minutos, la
// prueba mueve la "última actividad" guardada en localStorage (es el reloj que comparten las pestañas).
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import { hastaQue, clicSel } from '../apoyo/esperas.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, txt) => { (c ? ok : fallo).push(txt); console.log((c ? 'OK  ' : 'MAL ') + txt); };
const MIN = 60_000;

// ── 1. Lógica pura ──
const ina = await import(pathToFileURL(path.join(RAIZ, 'src/utils/inactividad.js')).href);
const T = 1_000_000_000_000;
revisar(ina.faseInactividad(T, T + 13 * MIN).fase === 'activo', 'lógica: 13 min quieto = activo');
const f14 = ina.faseInactividad(T, T + 14 * MIN);
revisar(f14.fase === 'aviso' && f14.segundos === 60, `lógica: a los 14 min sale el aviso con 60 s (${JSON.stringify(f14)})`);
const f1459 = ina.faseInactividad(T, T + 15 * MIN - 500);
revisar(f1459.fase === 'aviso' && f1459.segundos === 1, `lógica: medio segundo antes del límite = aviso con 1 s (${JSON.stringify(f1459)})`);
revisar(ina.faseInactividad(T, T + 15 * MIN).fase === 'cerrar', 'lógica: a los 15 min se cierra');
revisar(ina.faseInactividad(T, T + 600 * MIN).fase === 'cerrar', 'lógica: horas después = cerrar');

// ── 2. En la app ──
const USUARIO = { id: 1, nombre: 'Ana', usuario: 'ana', rol: 'Publicador', congregacion_id: 'c1', congregacion_nombre: 'Centro' };
let renovaciones = 0;
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  if (u.pathname === '/functions/v1/sesion') {
    const d = JSON.parse(req.postData() || '{}');
    if (d.accion === 'renovar' && d.token) {
      renovaciones++;
      return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: USUARIO, token: `tok-nuevo-${renovaciones}`, expira: Math.floor(Date.now() / 1000) + 30 * 86400, blindaje: false }) });
    }
    return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, blindaje: false }) });
  }
  if (u.pathname.startsWith('/functions/')) return req.respond({ status: 404, headers: cors, body: '{}' });
  const objeto = (req.headers().accept || '').includes('vnd.pgrst.object');
  return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: objeto ? '{}' : '[]' });
});
await page.evaluateOnNewDocument(() => {
  try {
    if (!sessionStorage.getItem('__prueba_inicio')) { localStorage.clear(); sessionStorage.setItem('__prueba_inicio', '1'); }
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  } catch { /* */ }
});
// Entra "con sesión" (usuario + token vigente, obtenido hoy: al abrir no toca renovar)
const conSesion = (actividad) => page.evaluate((u, a) => {
  localStorage.setItem('territorial_user', JSON.stringify(u));
  localStorage.setItem('territorial_token', JSON.stringify({ token: 'tok-viejo', expira: Math.floor(Date.now() / 1000) + 20 * 86400, obtenido: Date.now() }));
  if (a === null) localStorage.removeItem('territorial_actividad'); else localStorage.setItem('territorial_actividad', String(Date.now() - a));
}, USUARIO, actividad);
const fijarQuieto = (ms) => page.evaluate((m) => localStorage.setItem('territorial_actividad', String(Date.now() - m)), ms);
const actividad = () => page.evaluate(() => Date.now() - Number(localStorage.getItem('territorial_actividad') || 0));
const hayAviso = () => page.evaluate(() => !!document.querySelector('[data-aviso-inactividad]'));
const segundos = () => page.evaluate(() => Number(document.querySelector('[data-segundos]')?.textContent || -1));
const enLogin = () => page.evaluate(() => location.pathname === '/login' && !localStorage.getItem('territorial_user'));
const entrar = async (quieto = null) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await conSesion(quieto);
  await page.goto(`${BASE}/informes`, { waitUntil: 'networkidle2' });
};

await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });

// 2a. Sesión de antes de esta función (sin reloj guardado): no la saca, empieza a contar
await entrar(null);
await hastaQue(page, () => !!localStorage.getItem('territorial_actividad'));
revisar(await page.evaluate(() => location.pathname) === '/informes' && !(await hayAviso()), 'sesión sin reloj guardado: sigue dentro y sin aviso');
const a0 = await actividad();
revisar(a0 >= 0 && a0 < 5000, `el reloj empieza al abrir (${a0} ms)`);

// 2b. 14.5 min quieto → aviso con ~30 s
await fijarQuieto(14 * MIN + 30_000);
revisar(await hastaQue(page, () => !!document.querySelector('[data-aviso-inactividad]'), null, 5000), 'a los 14 min sin actividad sale "¿Sigues ahí?"');
const s1 = await segundos();
revisar(s1 >= 25 && s1 <= 30, `cuenta regresiva de ~30 s (${s1})`);
const txt = await page.evaluate(() => document.querySelector('[data-aviso-inactividad]')?.innerText.replace(/\s+/g, ' ') || '');
revisar(txt.includes('¿Sigues ahí?') && txt.includes('Sí, aquí sigo') && txt.includes('Cerrar Sesión'), `texto del aviso ("${txt}")`);
revisar(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'aviso a 360 px sin scroll horizontal');
await page.screenshot({ path: `${OUT}/inactividad-aviso-360.png` });
await espera(2200);
const s2 = await segundos();
revisar(s2 < s1 && s2 >= s1 - 3, `la cuenta baja (${s1} → ${s2})`);

// 2c. Mover el mouse o tocar fuera NO lo quita (hay que contestar)
await page.mouse.move(10, 10); await page.mouse.move(200, 300);
await page.touchscreen.tap(8, 8);
await page.keyboard.press('Escape');
await espera(1200);
revisar(await hayAviso(), 'mover el mouse, tocar fuera o Escape no quitan el aviso');

// 2d. "Sí, aquí sigo" → se quita, reloj en cero y token nuevo
await clicSel(page, '[data-sigo-aqui]');
await hastaQue(page, () => !document.querySelector('[data-aviso-inactividad]'), null, 3000);
revisar(!(await hayAviso()), '"Sí, aquí sigo" quita el aviso');
const a1 = await actividad();
revisar(a1 >= 0 && a1 < 5000, `el reloj vuelve a empezar (${a1} ms)`);
await hastaQue(page, () => JSON.parse(localStorage.getItem('territorial_token') || '{}').token?.startsWith('tok-nuevo'), null, 5000);
const tok = await page.evaluate(() => JSON.parse(localStorage.getItem('territorial_token') || '{}').token);
revisar(renovaciones === 1 && tok === 'tok-nuevo-1', `se renovó el token una vez (${renovaciones}, ${tok})`);
revisar(await page.evaluate(() => location.pathname) === '/informes', 'sigue en la misma pantalla');

// 2e. Otra pestaña contestó (el reloj compartido se mueve) → aquí también se quita
await fijarQuieto(14 * MIN + 10_000);
await hastaQue(page, () => !!document.querySelector('[data-aviso-inactividad]'), null, 5000);
await page.evaluate(() => localStorage.setItem('territorial_actividad', String(Date.now())));
revisar(await hastaQue(page, () => !document.querySelector('[data-aviso-inactividad]'), null, 4000), 'si en otra pestaña contestan, el aviso se quita aquí también');

// 2f. Sin respuesta → se cierra la sesión con su aviso en el login
await fijarQuieto(15 * MIN - 3000);
await hastaQue(page, () => !!document.querySelector('[data-aviso-inactividad]'), null, 3000);
revisar(await hastaQue(page, () => location.pathname === '/login' && !localStorage.getItem('territorial_user'), null, 8000), 'sin respuesta en el minuto se cierra la sesión');
revisar(await page.evaluate(() => !localStorage.getItem('territorial_token')), 'al cerrar se olvida el token');
revisar(await hastaQue(page, () => document.body.innerText.includes('Tu sesión se cerró por inactividad'), null, 4000), 'el login dice que se cerró por inactividad');
await page.screenshot({ path: `${OUT}/inactividad-login-360.png` });

// 2g. Volver con la app después de mucho tiempo (teléfono bloqueado) → fuera de una vez
await entrar(2 * 60 * MIN);
revisar(await hastaQue(page, () => location.pathname === '/login' && !localStorage.getItem('territorial_user'), null, 5000), 'abrir la app 2 h después: hay que entrar otra vez');

// 2h. Tocar la pantalla después del límite no "revive" la sesión
await entrar(0);
await hastaQue(page, () => location.pathname === '/informes', null, 5000);
await page.evaluate(() => { localStorage.setItem('territorial_actividad', String(Date.now() - 16 * 60_000)); window.dispatchEvent(new Event('pointerdown')); });
const vivo = await page.evaluate(() => Date.now() - Number(localStorage.getItem('territorial_actividad')));
revisar(vivo > 15 * MIN, 'un toque después del límite no reinicia el reloj');
revisar(await hastaQue(page, () => location.pathname === '/login', null, 4000), '...y la sesión se cierra');

// 2i. Sin internet NO se cierra (no podrían volver a entrar); al volver la conexión empieza de cero
await entrar(0);
await hastaQue(page, () => location.pathname === '/informes', null, 5000);
await page.setOfflineMode(true);
await espera(500);
await fijarQuieto(20 * MIN);
await espera(2500);
revisar(await page.evaluate(() => location.pathname === '/informes' && !!localStorage.getItem('territorial_user')), 'sin internet no cierra la sesión aunque pasen 20 min');
revisar(!(await hayAviso()), 'sin internet no sale el aviso');
await page.setOfflineMode(false);
await espera(2500);
revisar(await page.evaluate(() => location.pathname === '/informes') && !(await hayAviso()), 'al volver la conexión sigue dentro (el reloj empieza otra vez)');

// 2j. "Cerrar Sesión" desde el aviso → login sin el mensaje de inactividad
await fijarQuieto(14 * MIN + 20_000);
await hastaQue(page, () => !!document.querySelector('[data-aviso-inactividad]'), null, 5000);
await page.evaluate(() => [...document.querySelectorAll('[data-aviso-inactividad] button')].find(b => b.innerText.includes('Cerrar'))?.click());
revisar(await hastaQue(page, () => location.pathname === '/login' && !localStorage.getItem('territorial_user'), null, 5000), '"Cerrar Sesión" en el aviso saca de la app');
revisar(!(await page.evaluate(() => document.body.innerText.includes('inactividad'))), '...sin el mensaje de inactividad');

// 2k. Escritorio
await page.setViewport({ width: 1280, height: 800 });
await entrar(14 * MIN + 30_000);
await hastaQue(page, () => !!document.querySelector('[data-aviso-inactividad]'), null, 5000);
revisar(await hayAviso(), 'escritorio: también sale el aviso');
await page.screenshot({ path: `${OUT}/inactividad-aviso-1280.png` });
await clicSel(page, '[data-sigo-aqui]');
await espera(800);
revisar(!(await hayAviso()) && renovaciones === 2, `escritorio: "Sí, aquí sigo" funciona (renovaciones: ${renovaciones})`);

const errores = logs.filter(l => l.startsWith('[pageerror]'));
revisar(errores.length === 0, `sin errores en la página${errores.length ? ': ' + errores.join(' | ') : ''}`);

await browser.close();
console.log(`\nOK (${ok.length})`);
if (fallo.length) { console.log('FALLOS:'); fallo.forEach(f => console.log('  - ' + f)); console.log(''); process.exit(1); }
