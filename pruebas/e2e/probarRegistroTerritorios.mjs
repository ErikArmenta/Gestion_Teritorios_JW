// 8) Registro de asignación de territorios: lógica del reporte y descargas (Excel, PDF, reporte interactivo) desde Grupos.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const DESC = path.join(OUT, 'descargas-registro');
fs.rmSync(DESC, { recursive: true, force: true });
fs.mkdirSync(DESC, { recursive: true });
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);
const { reporteRegistroTerritorios } = await import(pathToFileURL(path.join(RAIZ, 'src/utils/registroTerritorios.js')).href);
const { default: ExcelJS } = await import(pathToFileURL(path.join(RAIZ, 'node_modules/exceljs/excel.js')).href);

const C = 'c1';
const territorios = [
  { id: 1, numero: '1', nombre: 'Centro', congregacion_id: C, coordenadas: [[19.4, -99.1], [19.41, -99.1], [19.41, -99.09]], color: '#2563EB' },
  { id: 2, numero: '2', nombre: 'Norte', congregacion_id: C, coordenadas: [[19.42, -99.1], [19.43, -99.1], [19.43, -99.09]], color: '#10B981' },
  { id: 3, numero: '10', nombre: 'Nunca', congregacion_id: C, coordenadas: [[19.44, -99.1], [19.45, -99.1], [19.45, -99.09]], color: '#F59E0B' },
  { id: 4, numero: '3', nombre: 'Viejo', congregacion_id: C, coordenadas: [[19.46, -99.1], [19.47, -99.1], [19.47, -99.09]], color: '#EF4444' },
];
const grupos = [{ id: 1, nombre: 'Grupo Juárez', congregacion_id: C, color: '#2563EB', activo: true }, { id: 2, nombre: 'Grupo Hidalgo', congregacion_id: C, color: '#10B981', activo: true }];
const miembros = [{ id: 7, nombre: 'Daniel', rol: 'Anciano', grupo_id: 1, activo: true, congregacion_id: C }, { id: 8, nombre: 'Ana', rol: 'Publicador', grupo_id: 2, activo: true, congregacion_id: C }];
const trabajos = [
  { id: 1, territorio_id: 1, grupo_id: 1, congregacion_id: C, estado: 'completado', fecha_inicio: '2025-09-01', fecha_fin: '2025-10-11', asignado_por: 7, completado_por: 7 },
  { id: 2, territorio_id: 1, grupo_id: 2, congregacion_id: C, estado: 'completado', fecha_inicio: '2026-01-05', fecha_fin: '2026-02-04', asignado_por: 7, completado_por: 8 },
  { id: 3, territorio_id: 2, grupo_id: 2, congregacion_id: C, estado: 'en_progreso', fecha_inicio: '2026-07-01', fecha_fin: null, asignado_por: 7 },
  { id: 4, territorio_id: 4, grupo_id: 1, congregacion_id: C, estado: 'completado', fecha_inicio: '2025-01-01', fecha_fin: '2025-02-01', asignado_por: 7, completado_por: 7 },
  { id: 5, territorio_id: 2, grupo_id: 1, congregacion_id: C, estado: 'cancelado', fecha_inicio: '2025-11-01', fecha_fin: '2025-11-15' },
];

// ── Lógica (año de servicio 2026 = sept 2025 – ago 2026), "hoy" fijo ──
const r = reporteRegistroTerritorios({ territorios, trabajos, grupos, miembros, anio: 2026, usuario: 'Daniel', congregacion: 'Centro', hoy: '2026-08-15' });
const tabla = (titulo) => r.secciones.find((s) => s.tipo === 'tabla' && s.titulo.startsWith(titulo));
const porT = tabla('Por territorio').filas;
const t1 = porT.find((f) => f.territorio === '1 · Centro');
revisar(t1.vueltas === 2 && t1.ultimo === '2026-02-04' && t1.promedio === 35 && t1.estado === 'Completado' && t1.sinTrabajar === 192, `territorio 1: 2 vueltas, última 04/02, promedio 35 días, 192 sin trabajar (${JSON.stringify(t1)})`);
revisar(porT.find((f) => f.numero === '2').estado === 'En progreso' && porT.find((f) => f.numero === '2').grupo === 'Grupo Hidalgo', 'territorio 2: en progreso con su grupo');
revisar(porT.map((f) => f.numero).join(',') === '1,2,3,10', 'orden por número (10 después de 3)');
const olv = tabla('Más de 4 meses').filas.map((f) => f.numero).sort().join(',');
revisar(olv === '1,10,3', `más de 4 meses sin trabajar: 1, 3 (viejo) y 10 (nunca) — (${olv})`);
const hist = tabla('Historial').filas;
revisar(hist.length === 4 && !hist.some((h) => h.territorio.startsWith('3 ·')) && hist.some((h) => h.estado === 'Cancelado') && hist.find((h) => h.estado === 'En progreso').dias === 45, `historial del año: 4 (sin el de 2025-02; incluye el cancelado; en progreso con 45 días) (${hist.length})`);
revisar(hist.find((h) => h.inicio === '2026-01-05').asigno === 'Daniel' && hist.find((h) => h.inicio === '2026-01-05').termino === 'Ana', 'quién asignó y quién terminó');
const graf = r.secciones.find((s) => s.tipo === 'grafica' && s.titulo.startsWith('Territorios terminados')).grafica;
revisar(graf.series[0].valores[1] === 1 && graf.series[0].valores[5] === 1 && graf.series[0].valores.reduce((a, b) => a + b, 0) === 2, 'gráfica por mes: octubre y febrero');
revisar(r.kpis.find((k) => k.etiqueta.startsWith('Terminados')).valor === 1 && r.kpis.find((k) => k.etiqueta === 'Días por vuelta').valor === 35, 'indicadores: 1 territorio terminado (2 vueltas), 35 días por vuelta');

// ── Descargas desde Grupos ──
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DESC });
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
const datos = { territorios, grupos_predicacion: grupos, territorio_trabajos: trabajos, app_usuarios: miembros, congregaciones: [{ id: C, nombre: 'Centro' }] };
page.on('request', (req) => {
  const u = new URL(req.url());
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  const tabla = u.pathname.split('/').pop();
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const filas = u.pathname.startsWith('/functions/') ? {} : (datos[tabla] || []);
  return req.respond({ status: u.pathname.startsWith('/functions/') ? 404 : 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(objeto ? (filas[0] || {}) : filas) });
});
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('territorial_user', JSON.stringify({ id: 7, nombre: 'Daniel', usuario: 'd', rol: 'Anciano', congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
  localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
  sessionStorage.setItem('notif_banner_dismissed', 'true');
});
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(`${BASE}/grupos`, { waitUntil: 'networkidle2' });
await espera(1800);
revisar(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Grupos 390px: botones del registro sin scroll horizontal');
await page.screenshot({ path: `${OUT}/registro-grupos-390.png` });
const archivos = () => fs.readdirSync(DESC).filter(f => !f.endsWith('.crdownload'));
const bajar = async (texto, patron) => {
  const antes = new Set(archivos());
  await page.evaluate((x) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === x && !b.disabled)?.click(), texto);
  for (let i = 0; i < 60; i++) { await espera(250); const n = archivos().find(f => !antes.has(f) && patron.test(f)); if (n) { await espera(300); return path.join(DESC, n); } }
  return null;
};
// Elegir el año de servicio 2026 si está en la lista (si no, el actual)
await page.evaluate(() => { const s = document.querySelector('select[aria-label="Año de servicio"]'); if (s && [...s.options].some(o => o.value === '2026')) { s.value = '2026'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
await espera(300);
const x = await bajar('Excel', /^Registro_Territorios_.*\.xlsx$/);
if (x) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(x);
  const hojas = wb.worksheets.map(w => w.name);
  revisar(['Resumen', 'Por territorio', 'Historial', 'Sin trabajar'].every(h => hojas.includes(h)), `Excel: hojas ${JSON.stringify(hojas)}`);
} else revisar(false, 'Excel: no descargó');
const p = await bajar('PDF', /^Registro_Territorios_.*\.pdf$/);
revisar(!!p && fs.statSync(p).size > 10000, `PDF descargado (${p ? Math.round(fs.statSync(p).size / 1024) : 0} KB)`);
const h = await bajar('Reporte interactivo', /^Registro_Territorios_.*\.html$/);
if (h) {
  const ph = await browser.newPage();
  await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await ph.goto(pathToFileURL(h).href, { waitUntil: 'load' });
  const info = await ph.evaluate(() => ({ tablas: document.querySelectorAll('[data-tabla]').length, kpis: document.querySelectorAll('.kpi').length, scroll: document.documentElement.scrollWidth > innerWidth + 1 }));
  revisar(info.tablas >= 2 && info.kpis === 5 && !info.scroll, `reporte interactivo: ${info.kpis} indicadores, ${info.tablas} tablas, sin scroll a 390px`);
  await ph.screenshot({ path: `${OUT}/registro-interactivo-390.png`, fullPage: true });
  await ph.close();
} else revisar(false, 'reporte interactivo: no descargó');

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
