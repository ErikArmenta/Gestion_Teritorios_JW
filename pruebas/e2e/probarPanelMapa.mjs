// Panel de abajo de las pantallas con mapa en el celular (components/PanelMapa.jsx): empieza colapsado (barrita con
// título y resumen), se abre/cierra con la rayita, la barrita o deslizando, se recuerda por pantalla, y se abre solo
// cuando la pantalla muestra algo elegido. El mapa es el 3D real (WebGL por software); los estilos del mapa se
// sirven vacíos para no depender de internet.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import { hastaQue } from '../apoyo/esperas.mjs';

const [, , OUT] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const territorios = [{ id: 1, nombre: 'Norte', numero: '1', congregacion_id: 'c1', coordenadas: [[31.77, -106.44], [31.78, -106.44], [31.78, -106.43]], color: '#2563EB', created_at: '2026-01-01' }];
const casas = [{ id: 7, territorio_id: 1, direccion: 'Calle Uno 123', latitud: 31.775, longitud: -106.437, estado: 'Pendiente', created_at: '2026-01-01' }];
const ESTILO = JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#111827' } }], glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf' });

const browser = await puppeteer.launch({
  executablePath: NAVEGADOR, headless: 'new',
  args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (u.hostname.endsWith('openfreemap.org')) {
    if (u.pathname.startsWith('/styles/')) return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: ESTILO });
    return req.respond({ status: 404, headers: cors, body: '' });
  }
  if (u.hostname.includes('arcgisonline') || u.hostname.includes('openstreetmap')) return req.respond({ status: 404, headers: cors, body: '' });
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  if (u.pathname.startsWith('/functions/')) return req.respond({ status: 404, headers: cors, body: '{}' });
  const t = u.pathname.split('/').pop();
  const filas = t === 'territorios' ? territorios : t === 'casas' ? casas : [];
  const objeto = (req.headers().accept || '').includes('vnd.pgrst.object');
  return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(objeto ? (filas[0] || {}) : filas) });
});
await page.evaluateOnNewDocument(() => {
  try {
    if (!sessionStorage.getItem('__prueba_inicio')) { localStorage.clear(); sessionStorage.setItem('__prueba_inicio', '1'); }
    localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Súper', usuario: 's', rol: 'Super Admin', congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  } catch { /* */ }
});
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const estado = () => page.evaluate(() => document.querySelector('.m3d-sheet')?.dataset.panelMapa || null);
const alto = () => page.evaluate(() => Math.round(document.querySelector('.m3d-sheet')?.getBoundingClientRect().height || 0));
const textoPanel = () => page.evaluate(() => document.querySelector('.m3d-sheet')?.innerText.replace(/\s+/g, ' ') || '');
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); return hastaQue(page, () => !!document.querySelector('.m3d-sheet'), null, 30000); };
const deslizar = async (dy) => {
  const r = await page.evaluate(() => { const b = document.querySelector('.m3d-sheet').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 14 }; });
  await page.touchscreen.touchStart(r.x, r.y);
  for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(r.x, r.y + (dy * i) / 5);
  await page.touchscreen.touchEnd();
  await espera(400);
};

// 1. Mapa principal: empieza colapsado
const hay3D = await ir('/');
if (!hay3D) {
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  revisar(false, `no apareció el mapa 3D (WebGL2: ${gl})`);
} else {
  await hastaQue(page, () => /1 territorios/.test(document.querySelector('.m3d-sheet')?.innerText || ''));
  revisar(await estado() === 'colapsado', 'mapa principal: el panel empieza colapsado');
  const t0 = await textoPanel();
  revisar(t0.includes('Territorios') && t0.includes('1 territorios · 1 casas') && !t0.includes('Ver todos'), `colapsado: solo la barrita con título y resumen ("${t0}")`);
  const h0 = await alto();
  revisar(h0 > 0 && h0 < 90, `colapsado: el panel es bajito (${h0}px) y el mapa ocupa el resto`);
  const tapa = await page.evaluate(() => {
    const barra = document.querySelector('.m3d-sheet__barra')?.getBoundingClientRect();
    const panico = [...document.querySelectorAll('button')].find(b => /pánico|panic/i.test(b.getAttribute('aria-label') || '') || b.className.includes('panic'))?.getBoundingClientRect();
    return { barra: barra && Math.round(barra.right), panico: panico && Math.round(panico.left) };
  });
  revisar(!tapa.panico || tapa.barra <= tapa.panico, `la barrita no queda debajo del botón de pánico (${JSON.stringify(tapa)})`);
  revisar(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin scroll horizontal');
  await page.screenshot({ path: `${OUT}/panel-colapsado-390.png` });

  // 2. Tocar la barrita → se abre (y se recuerda)
  await page.evaluate(() => document.querySelector('.m3d-sheet__barra')?.click());
  await hastaQue(page, () => document.querySelector('.m3d-sheet')?.dataset.panelMapa === 'abierto');
  const h1 = await alto();
  revisar(await estado() === 'abierto' && (await textoPanel()).includes('Ver todos') && h1 > h0 + 60, `tocar la barrita: se abre con todo (${h0} → ${h1}px)`);
  revisar(await page.evaluate(() => localStorage.getItem('panel_mapa:/')) === '0', 'se recuerda abierto');
  await page.screenshot({ path: `${OUT}/panel-abierto-390.png` });

  // 3. La rayita → se colapsa
  await page.evaluate(() => document.querySelector('.m3d-sheet__asa')?.click());
  await hastaQue(page, () => document.querySelector('.m3d-sheet')?.dataset.panelMapa === 'colapsado');
  revisar(await estado() === 'colapsado' && await page.evaluate(() => localStorage.getItem('panel_mapa:/')) === '1', 'la rayita lo colapsa (y se recuerda)');

  // 4. Deslizar arriba / abajo
  await deslizar(-80);
  revisar(await estado() === 'abierto', 'deslizar hacia arriba: se abre');
  await deslizar(90);
  revisar(await estado() === 'colapsado', 'deslizar hacia abajo: se colapsa');

  // 5. Se recuerda al volver
  await page.evaluate(() => document.querySelector('.m3d-sheet__barra')?.click());
  await espera(300);
  await ir('/');
  await espera(800);
  revisar(await estado() === 'abierto', 'al volver a la pantalla: como lo dejaste (abierto)');
  await page.evaluate(() => document.querySelector('.m3d-sheet__asa')?.click());
  await espera(300);
  await ir('/');
  await espera(800);
  revisar(await estado() === 'colapsado', 'al volver a la pantalla: como lo dejaste (colapsado)');

  // 6. Otra pantalla tiene su propio recuerdo; si abre con algo elegido, arranca abierto
  await ir('/exhibidores');
  await espera(800);
  revisar(await estado() === 'colapsado' && (await textoPanel()).includes('Exhibidores'), 'Exhibidores: también empieza colapsado');
  await ir('/territorios?id=1');
  await hastaQue(page, () => document.querySelector('.m3d-sheet')?.dataset.panelMapa === 'abierto', null, 8000);
  const tt = await textoPanel();
  revisar(await estado() === 'abierto' && tt.includes('Norte'), `Territorios con uno elegido (Gestionar): arranca abierto con su ficha ("${tt.slice(0, 60)}")`);
  await page.evaluate(() => document.querySelector('.m3d-sheet__asa')?.click());
  await espera(300);
  revisar((await textoPanel()).includes('Norte'), 'colapsado con un territorio elegido: la barrita dice cuál');
  await ir('/register');
  await espera(800);
  revisar(await estado() === 'colapsado' && (await textoPanel()).includes('Registrar Casa'), 'Registrar casa: empieza colapsado');
  await page.evaluate(() => document.querySelector('.m3d-sheet__barra')?.click());
  await espera(400);
  revisar((await textoPanel()).includes('Guardar Casa'), 'Registrar casa: al abrirlo sale el formulario');
}

// 7. Escritorio: sin cambios (el panel va dentro del menú flotante)
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await hastaQue(page, () => !!document.querySelector('.m3d-menu'), null, 20000);
revisar(!(await page.evaluate(() => !!document.querySelector('.m3d-sheet'))) && (await page.evaluate(() => document.querySelector('.m3d-menu')?.innerText || '')).includes('Ver todos'), 'escritorio: igual que antes (panel dentro del menú flotante)');

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
