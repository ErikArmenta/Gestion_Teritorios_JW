// Reportes: Excel / PDF / Reporte interactivo desde Estadísticas, Informes (Congregación y Actividad), Alertas
// y la plantilla de casas. Descarga real de archivos y revisión de su contenido. Supabase interceptado.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const DESC = path.join(OUT, 'descargas');
fs.rmSync(DESC, { recursive: true, force: true });
fs.mkdirSync(DESC, { recursive: true });
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => { (c ? ok : fallo).push(t); };
const { default: ExcelJS } = await import(pathToFileURL(path.join(RAIZ, 'node_modules/exceljs/excel.js')).href);

// ── Datos de prueba ──
const C = 'c1';
const hoy = new Date();
const d2 = (n) => String(n).padStart(2, '0');
const mesAct = `${hoy.getFullYear()}-${d2(hoy.getMonth() + 1)}-01`;
const XSS = '<img src=x onerror="window.__xss=1">';
const poli = (lat, lng) => [[lat, lng], [lat + 0.004, lng], [lat + 0.004, lng + 0.004], [lat, lng + 0.004]];
const territorios = [
  { id: 1, nombre: 'Norte', numero: '1', congregacion_id: C, coordenadas: poli(19.40, -99.10), color: '#2563EB', created_at: '2026-01-01' },
  { id: 2, nombre: 'Sur', numero: '2', congregacion_id: C, coordenadas: poli(19.42, -99.10), color: '#10B981', created_at: '2026-01-01' },
  { id: 3, nombre: `Centro ${XSS}`, numero: '3', congregacion_id: C, coordenadas: poli(19.44, -99.10), color: '#F59E0B', created_at: '2026-01-01' },
];
const ESTADOS = ['Atendido', 'No atendió', 'Pendiente', 'No tocar', 'Solo fines de semana'];
const casas = Array.from({ length: 36 }, (_, i) => ({
  id: i + 1, territorio_id: (i % 3) + 1, territorio_nombre: territorios[i % 3].nombre,
  direccion: `Calle ${i + 1} #${100 + i}`, estado: ESTADOS[i % 5], latitud: 19.401 + (i % 3) * 0.02, longitud: -99.099,
  nombre_contacto: i % 4 ? `Vecino ${i}` : '', telefono: i % 2 ? `55-0000-${d2(i)}` : '',
  tiene_caso_especial: i % 7 === 0, tipo_caso: i % 7 === 0 ? 'Sordo' : null, detalles_caso: i % 7 === 0 ? `Nota ${XSS}` : null,
  notas: i === 5 ? '<script>window.__xss=2</script>' : '', created_at: `2026-${d2((i % 10) + 1)}-15T10:00:00Z`,
}));
const miembros = [
  { id: 1, nombre: 'Daniel Armenta', rol: 'Super Admin', tipo_publicador: 'Precursor regular', activo: true, congregacion_id: C, grupo_id: 1, created_at: '2025-01-01' },
  { id: 2, nombre: 'Ana López', rol: 'Publicador', tipo_publicador: 'Publicador', activo: true, congregacion_id: C, grupo_id: 1, created_at: '2025-01-01' },
  { id: 3, nombre: 'Beto Ruiz', rol: 'Publicador', tipo_publicador: 'Precursor auxiliar', activo: true, congregacion_id: C, grupo_id: 1, created_at: '2025-01-01' },
  { id: 4, nombre: `Carla ${XSS}`, rol: 'Publicador', tipo_publicador: 'Publicador', activo: true, congregacion_id: C, grupo_id: null, created_at: '2025-01-01' },
];
const tablas = {
  territorios, casas,
  historial_visitas: casas.slice(0, 10).map((c, i) => ({ id: i + 1, casa_id: c.id, usuario_id: 2, usuario_nombre: 'Ana López', estado_nuevo: 'Atendido', created_at: new Date(Date.now() - i * 86400000).toISOString() })),
  app_usuarios: miembros,
  grupos_predicacion: [{ id: 1, congregacion_id: C, nombre: 'Grupo 1', color: '#2563EB', encargado_id: 1, activo: true }],
  territorio_trabajos: [{ id: 1, territorio_id: 1, grupo_id: 1, congregacion_id: C, estado: 'en_progreso', fecha_inicio: '2026-10-01' }, { id: 2, territorio_id: 2, grupo_id: 1, congregacion_id: C, estado: 'completado', fecha_inicio: '2026-08-01', fecha_fin: '2026-09-01' }],
  informes_servicio: [
    { id: 1, usuario_id: 1, congregacion_id: C, mes: mesAct, tipo_publicador: 'Precursor regular', predico: true, estudios: 2, horas: 52.5, revisitas: 9, horas_servicio_sagrado: 3, comentarios: 'Buen mes', enviado_en: new Date().toISOString() },
    { id: 2, usuario_id: 2, congregacion_id: C, mes: mesAct, tipo_publicador: 'Publicador', predico: true, estudios: 1, horas: 0, revisitas: 0, horas_servicio_sagrado: 1.5, comentarios: XSS, enviado_en: new Date().toISOString() },
  ],
  registros_servicio: [
    { id: 1, usuario_id: 1, congregacion_id: C, fecha: mesAct, categoria: 'predicacion', tipo: 'casa_en_casa', horas: 30, revisitas: 5 },
    { id: 2, usuario_id: 1, congregacion_id: C, fecha: mesAct, categoria: 'predicacion', tipo: 'cartas', horas: 12.5, revisitas: 2 },
    { id: 3, usuario_id: 1, congregacion_id: C, fecha: mesAct, categoria: 'predicacion', tipo: 'exhibidor', horas: 10, revisitas: 2 },
    { id: 4, usuario_id: 3, congregacion_id: C, fecha: mesAct, categoria: 'predicacion', tipo: 'telefono', horas: 8, revisitas: 1 },
    { id: 5, usuario_id: 1, congregacion_id: C, fecha: mesAct, categoria: 'servicio_sagrado', tipo: null, horas: 3, revisitas: 0 },
  ],
  alertas_panico: Array.from({ length: 7 }, (_, i) => ({
    id: i + 1, usuario_id: (i % 3) + 1, congregacion_id: C, tipo: ['seguridad', 'medica', 'accidente'][i % 3], activa: i === 0,
    latitud: 19.402 + (i % 3) * 0.02, longitud: -99.098, mensaje: i === 2 ? XSS : `Ayuda ${i}`,
    respondieron: i % 2 ? [{ nombre: 'Ana López' }] : [], created_at: new Date(Date.now() - i * 20 * 86400000).toISOString(),
    cerrada_at: i === 0 ? null : new Date(Date.now() - i * 20 * 86400000 + 900000).toISOString(),
    app_usuarios: { nombre: miembros[i % 3].nombre },
  })),
  congregaciones: [{ id: C, nombre: 'Centro' }],
};

const browser = await puppeteer.launch({
  executablePath: NAVEGADOR, headless: 'new',
  args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'],
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DESC });
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) logs.push('[console] ' + m.text().slice(0, 200)); });
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const u = new URL(url);
  const json = (status, body, extra = {}) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  if (u.pathname.startsWith('/functions/')) return json(404, {});
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  const tabla = u.pathname.split('/').pop();
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (tabla === 'congregaciones' && u.search.includes('meses_inactividad')) return json(400, { code: '42703', message: 'column meses_inactividad does not exist' });
  let filas = tablas[tabla] || [];
  if (tabla === 'informes_servicio' || tabla === 'registros_servicio') filas = filas; // todos del mes
  return json(200, objeto ? (filas[0] || {}) : filas);
});

const usuario = { id: 1, nombre: 'Daniel Armenta', usuario: 'dani', rol: 'Super Admin', congregacion_id: C, congregacion_nombre: 'Centro' };
await page.evaluateOnNewDocument((u) => {
  try {
    localStorage.setItem('territorial_user', JSON.stringify(u));
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  } catch { /* */ }
}, usuario);
await page.setViewport({ width: 1280, height: 900 });
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1800); };
const archivos = () => fs.readdirSync(DESC).filter(f => !f.endsWith('.crdownload'));
async function descargar(textoBoton, patron, { contenedor = null } = {}) {
  const antes = new Set(archivos());
  const hecho = await page.evaluate((txt, cont) => {
    const raiz = cont ? [...document.querySelectorAll('button')].find(b => b.textContent.trim() === cont)?.closest('div')?.parentElement || document : document;
    const b = [...raiz.querySelectorAll('button')].find(x => x.textContent.trim() === txt && x.offsetParent !== null && !x.disabled);
    b?.click();
    return !!b;
  }, textoBoton, contenedor);
  if (!hecho) return null;
  for (let i = 0; i < 60; i++) {
    await espera(250);
    const nuevo = archivos().find(f => !antes.has(f) && patron.test(f));
    if (nuevo) { await espera(300); return path.join(DESC, nuevo); }
  }
  return null;
}

async function revisarExcel(ruta, nombre, { hojas = [], filaMin = 1 } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const nombres = wb.worksheets.map(w => w.name);
  revisar(hojas.every(h => nombres.includes(h)), `${nombre} Excel: hojas ${JSON.stringify(nombres)}`);
  const res = wb.getWorksheet('Resumen');
  revisar(res && /\S/.test(String(res.getCell(1, 2).value || '')) && res.getImages().length === 1, `${nombre} Excel: título "${res?.getCell(1, 2).value}" y logo`);
  const tabla = wb.worksheets.find(w => w.name !== 'Resumen');
  if (tabla) {
    let head = null;
    for (let r = 5; r <= 8; r++) if (tabla.getRow(r).getCell(1).fill?.fgColor) { head = r; break; }
    const celdaHead = tabla.getRow(head || 6).getCell(1);
    revisar(!!head && celdaHead.font?.bold && celdaHead.font?.color?.argb === 'FFFFFFFF', `${nombre} Excel: encabezado con color (fila ${head})`);
    revisar(tabla.views?.[0]?.state === 'frozen' && !!tabla.autoFilter, `${nombre} Excel: encabezado fijo y filtros`);
    revisar(tabla.rowCount - (head || 6) >= filaMin, `${nombre} Excel: ${tabla.rowCount - (head || 6)} filas de datos`);
  }
  return wb;
}
// Cuenta las páginas y, de paso, revisa que el PDF no venga inflado (imágenes sin comprimir = varios MB)
const paginasPDF = (ruta) => {
  const kb = Math.round(fs.statSync(ruta).size / 1024);
  revisar(kb < 1024, `${path.basename(ruta)}: pesa ${kb} KB (menos de 1 MB)`);
  return (fs.readFileSync(ruta, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
};

async function revisarHTML(ruta, nombre, { buscar, filasMin = 1 } = {}) {
  const p = await browser.newPage();
  let dialogo = false;
  p.on('dialog', async d => { dialogo = true; await d.dismiss(); });
  for (const [ancho, tema] of [[1280, 'light'], [390, 'dark']]) {
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema }]);
    await p.setViewport(ancho < 768 ? { width: ancho, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: ancho, height: 900 });
    await p.goto(pathToFileURL(ruta).href, { waitUntil: 'load' });
    await espera(400);
    const info = await p.evaluate(() => ({
      xss: window.__xss, scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      kpis: document.querySelectorAll('.kpi').length, graf: document.querySelectorAll('.graf svg').length,
      tablas: document.querySelectorAll('[data-tabla]').length, filas: document.querySelectorAll('tbody tr').length,
      dice: document.body.innerText.includes('HTML'), bg: getComputedStyle(document.body).backgroundColor,
    }));
    revisar(!info.xss && !dialogo, `${nombre} reporte ${ancho}px: texto de usuario escapado (sin XSS)`);
    revisar(!info.scroll, `${nombre} reporte ${ancho}px: sin scroll horizontal`);
    revisar(info.kpis >= 3 && info.graf >= 1 && info.tablas >= 1 && info.filas >= filasMin, `${nombre} reporte ${ancho}px: ${info.kpis} indicadores, ${info.graf} gráficas, ${info.tablas} tablas, ${info.filas} filas`);
    revisar(!info.dice, `${nombre} reporte: no dice "HTML"`);
    if (tema === 'dark') revisar(info.bg === 'rgb(11, 18, 32)', `${nombre} reporte: modo oscuro (${info.bg})`);
    await p.screenshot({ path: `${OUT}/rep-${nombre}-${ancho}.png`, fullPage: true });
  }
  // Búsqueda, orden y tooltip
  await p.setViewport({ width: 1280, height: 900 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await p.goto(pathToFileURL(ruta).href, { waitUntil: 'load' });
  if (buscar) {
    const r = await p.evaluate((q) => {
      const sec = document.querySelector('[data-tabla]:last-of-type') || document.querySelector('[data-tabla]');
      const inp = sec.querySelector('.buscar');
      const total = sec.querySelectorAll('tbody tr').length;
      inp.value = q; inp.dispatchEvent(new Event('input'));
      const vis = [...sec.querySelectorAll('tbody tr')].filter(tr => tr.style.display !== 'none').length;
      return { total, vis, cuenta: sec.querySelector('.cuenta').textContent };
    }, buscar);
    revisar(r.vis >= 1 && r.vis < r.total && /de/.test(r.cuenta), `${nombre} reporte: buscar "${buscar}" → ${r.cuenta}`);
  }
  const orden = await p.evaluate(() => {
    const sec = document.querySelector('[data-tabla]');
    const th = sec.querySelector('th.n') || sec.querySelector('th');
    const i = [...th.parentElement.children].indexOf(th);
    const col = () => [...sec.querySelectorAll('tbody tr')].map(tr => tr.cells[i].getAttribute('data-v') ?? tr.cells[i].textContent);
    th.click(); const a = col(); th.click(); const b = col();
    return { a, b, sort: th.getAttribute('aria-sort') };
  });
  revisar(orden.sort === 'descending' && JSON.stringify(orden.a) === JSON.stringify([...orden.b].reverse()), `${nombre} reporte: ordenar columna (asc/desc)`);
  // Busca un punto que de verdad esté sobre una figura (el centro de la caja de un arco cae en el hueco)
  const punto = await p.evaluate(() => {
    for (const el of document.querySelectorAll('.pt')) {
      const r = el.getBoundingClientRect();
      for (let fx = 0.1; fx < 1; fx += 0.1) for (let fy = 0.1; fy < 1; fy += 0.1) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (y > 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest('.pt') === el) return { x, y };
      }
    }
    return null;
  });
  if (punto) {
    await p.mouse.move(punto.x, punto.y);
    await espera(150);
    const t = await p.evaluate(() => { const e = document.getElementById('tip'); return e.hidden ? '' : e.textContent; });
    revisar(t.length > 0, `${nombre} reporte: detalle al pasar sobre la gráfica ("${t}")`);
  }
  await p.close();
}

// ── Estadísticas ──
await ir('/stats');
const eX = await descargar('Excel', /^Reporte_Territorial_.*\.xlsx$/);
revisar(!!eX, 'Estadísticas: descarga Excel');
if (eX) {
  const wb = await revisarExcel(eX, 'Estadísticas', { hojas: ['Resumen', 'Por territorio', 'Por estado', 'Casas'], filaMin: 3 });
  const ws = wb.getWorksheet('Por territorio');
  let head = 6; for (let r = 5; r <= 8; r++) if (ws.getRow(r).getCell(1).value === 'Territorio') head = r;
  const cob = ws.getRow(head + 1).getCell(7);
  revisar(cob.numFmt === '0.0%' && typeof cob.value === 'number', `Estadísticas Excel: cobertura como porcentaje real (${cob.value}, ${cob.numFmt})`);
  const tot = ws.getRow(head + 4).getCell(2).value;
  revisar(tot === 36, `Estadísticas Excel: fila de totales (casas = ${tot})`);
  const casasWs = wb.getWorksheet('Casas');
  revisar(casasWs.rowCount >= 36 + 6, `Estadísticas Excel: detalle de casas completo (${casasWs.rowCount} filas)`);
}
const eP = await descargar('PDF', /^Reporte_Territorial_.*\.pdf$/);
revisar(!!eP && paginasPDF(eP) >= 2, `Estadísticas: descarga PDF (${eP ? paginasPDF(eP) : 0} páginas)`);
const eH = await descargar('Reporte interactivo', /^Reporte_Territorial_.*\.html$/);
revisar(!!eH, 'Estadísticas: descarga reporte interactivo');
if (eH) {
  revisar(!fs.readFileSync(eH, 'utf8').includes('55-0000'), 'Estadísticas reporte: NO incluye teléfonos (se comparte)');
  await revisarHTML(eH, 'estadisticas', { buscar: 'Norte', filasMin: 5 });
}

// ── Alertas ──
await ir('/alerts');
const aX = await descargar('Excel', /^Reporte_Alertas_.*\.xlsx$/);
if (aX) await revisarExcel(aX, 'Alertas', { hojas: ['Resumen', 'Por usuario', 'Por territorio', 'Detalle'], filaMin: 3 });
else revisar(false, 'Alertas: descarga Excel');
const aP = await descargar('PDF', /^Reporte_Alertas_.*\.pdf$/);
revisar(!!aP && paginasPDF(aP) >= 1, `Alertas: descarga PDF (${aP ? paginasPDF(aP) : 0} páginas)`);
const aH = await descargar('Reporte interactivo', /^Reporte_Alertas_.*\.html$/);
if (aH) await revisarHTML(aH, 'alertas', { buscar: 'Ana', filasMin: 5 }); else revisar(false, 'Alertas: descarga reporte');

// ── Informes: Congregación y Actividad ──
await ir('/informes');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Congregación')?.click());
await espera(1500);
const iX = await descargar('Excel', /^Informes_.*\.xlsx$/);
if (iX) {
  const wb = await revisarExcel(iX, 'Informes', { hojas: ['Resumen', 'Resumen por tipo', 'Detalle'], filaMin: 3 });
  const det = wb.getWorksheet('Detalle');
  let head = 6; for (let r = 5; r <= 8; r++) if (det.getRow(r).getCell(1).value === 'Nombre') head = r;
  const titulos = det.getRow(head).values.slice(1);
  revisar(titulos.includes('Casa en casa') && titulos.includes('Comentarios'), `Informes Excel: columnas por concepto (${titulos.join(', ')})`);
} else revisar(false, 'Informes: descarga Excel');
const iP = await descargar('PDF', /^Informes_.*\.pdf$/);
revisar(!!iP, `Informes: descarga PDF (${iP ? paginasPDF(iP) : 0} páginas)`);
const iH = await descargar('Reporte interactivo', /^Informes_.*\.html$/);
if (iH) await revisarHTML(iH, 'informes', { buscar: 'Ana', filasMin: 4 }); else revisar(false, 'Informes: descarga reporte');

await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Actividad')?.click());
await espera(1800);
const tX = await descargar('Excel', /^Actividad_.*\.xlsx$/);
if (tX) await revisarExcel(tX, 'Actividad', { hojas: ['Resumen', 'Actividad'], filaMin: 4 }); else revisar(false, 'Actividad: descarga Excel');
const tP = await descargar('PDF', /^Actividad_.*\.pdf$/);
revisar(!!tP, 'Actividad: descarga PDF (nuevo)');
const tH = await descargar('Reporte interactivo', /^Actividad_.*\.html$/);
if (tH) await revisarHTML(tH, 'actividad', { buscar: 'Beto', filasMin: 4 }); else revisar(false, 'Actividad: descarga reporte');
// Botones en celular (360px) sin desbordar
await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ir('/informes');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Actividad')?.click());
await espera(1500);
revisar(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Informes 360px: botones de exportar sin scroll horizontal');
await page.screenshot({ path: `${OUT}/rep-botones-360.png` });

// ── Plantilla de casas ──
await page.setViewport({ width: 1280, height: 900 });
await ir('/list');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar Excel'))?.click());
await espera(600);
const pX = await descargar('Descargar Plantilla', /^plantilla_casas\.xlsx$/);
if (pX) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(pX);
  const ws = wb.worksheets[0];
  const head = ws.getRow(1).values.slice(1);
  revisar(ws.name === 'Casas' && JSON.stringify(head) === JSON.stringify(['Dirección', 'Territorio', 'Estado', 'Contacto', 'Teléfono', 'Notas']), `Plantilla: primera hoja y columnas exactas para el importador (${head.join(', ')})`);
  revisar(ws.getCell('C2').dataValidation?.type === 'list' && ws.getCell('B2').dataValidation?.formulae?.[0]?.startsWith('Listas!'), 'Plantilla: listas desplegables de Territorio y Estado');
  revisar(wb.getWorksheet('Listas')?.state === 'veryHidden' && !!wb.getWorksheet('Instrucciones'), 'Plantilla: hoja de listas oculta e instrucciones');
  // ¿El importador de la app lo sigue leyendo? (el mismo lector que usa HousesList: utils/leerTabla.js)
  const { leerTabla } = await import(pathToFileURL(path.join(RAIZ, 'src/utils/leerTabla.js')).href);
  const filas = await leerTabla(new File([fs.readFileSync(pX)], 'plantilla_casas.xlsx'));
  revisar(filas[0]?.[0] === 'Dirección' && filas[1]?.[0] === 'Calle Ejemplo 123' && filas[1]?.[1] === 'Norte', `Plantilla: el importador la lee igual (${JSON.stringify(filas[1])})`);
} else revisar(false, 'Plantilla: descarga');

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
console.log('\nARCHIVOS: ' + archivos().join(', '));
process.exitCode = fallo.length ? 1 : 0;
