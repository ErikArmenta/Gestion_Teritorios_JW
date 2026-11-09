// Registro de publicador (S-21): lógica de la hoja, PDF de todos (1 hoja por persona, sin encimarse, ligero),
// PDF de una persona (campos editables) y la ventana en Informes → Congregación.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { PDFDocument, PDFName } from 'pdf-lib';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const DESC = path.join(OUT, 'descargas-s21');
fs.rmSync(DESC, { recursive: true, force: true });
fs.mkdirSync(DESC, { recursive: true });
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const { armarHojaS21, s21Todos, s21Editable, mesesDelAnio, anioServicioDe, faltantesS21 } = await import(pathToFileURL(path.join(RAIZ, 'src/utils/s21.js')).href);
const plantilla = new Uint8Array(fs.readFileSync(path.join(RAIZ, 'public/formularios/S-21-S.pdf')));

// ── Lógica ──
revisar(anioServicioDe('2025-09-01') === 2026 && anioServicioDe('2026-08-01') === 2026 && anioServicioDe('2026-09-01') === 2027, 'año de servicio: septiembre abre el siguiente');
const meses = mesesDelAnio(2026);
revisar(meses[0] === '2025-09-01' && meses[3] === '2025-12-01' && meses[4] === '2026-01-01' && meses[11] === '2026-08-01', 'meses: septiembre 2025 … agosto 2026');
const inf = {
  [meses[0]]: { predico: true, estudios: 2, horas: 0, tipo_publicador: 'Publicador', comentarios: 'Visitó a 😀 su tía' },
  [meses[1]]: { predico: true, estudios: 0, horas: 30, tipo_publicador: 'Precursor auxiliar', comentarios: '', horas_servicio_sagrado: 2.5 },
  [meses[2]]: { predico: false, estudios: 0, horas: 0, tipo_publicador: 'Publicador' },
  [meses[3]]: { predico: true, estudios: 1, horas: 12, tipo_publicador: 'Publicador' }, // publicador: horas NO van
};
const h = armarHojaS21({ nombre: 'Ana López', tipo_publicador: 'Publicador' }, { sexo: 'Mujer', fecha_nacimiento: '1990-02-03', fecha_bautismo: '2004-06-07', esperanza: 'Otras ovejas' }, inf, 2026);
revisar(h.nacimiento === '03/02/1990' && h.bautismo === '07/06/2004' && h.mujer && !h.hombre && h.otrasOvejas && !h.regular, 'datos personales y casillas de arriba');
revisar(h.meses[0].participo && h.meses[0].estudios === '2' && !h.meses[0].auxiliar && h.meses[0].horas === '' && h.meses[0].notas === 'Visitó a su tía', `septiembre: participó, 2 cursos, sin horas, nota sin emoji ("${h.meses[0].notas}")`);
revisar(h.meses[1].auxiliar && h.meses[1].horas === '30' && /S\. sagrado 2\.5 h/.test(h.meses[1].notas), 'octubre de auxiliar: horas y servicio sagrado en notas');
revisar(!h.meses[2].participo && h.meses[3].horas === '' && h.meses[4].participo === false, 'noviembre sin predicar; publicador sin horas; mes sin informe vacío');
revisar(h.totalHoras === '30', `total de horas (${h.totalHoras})`);
const hr = armarHojaS21({ nombre: 'Daniel', tipo_publicador: 'Precursor regular' }, { nombramiento: 'Anciano', esperanza: 'Ungido', sexo: 'Hombre' }, { [meses[0]]: { predico: true, horas: 50.25, tipo_publicador: 'Precursor regular' } }, 2026);
revisar(hr.regular && hr.anciano && hr.ungido && hr.meses[0].horas === '50.25' && hr.totalHoras === '50.25', 'precursor regular anciano ungido con horas');
const he = armarHojaS21({ nombre: 'E', tipo_publicador: 'Precursor regular' }, { servicio_especial: 'Precursor especial' }, { [meses[0]]: { predico: true, horas: 100, tipo_publicador: 'Publicador' } }, 2026);
revisar(he.especial && !he.regular && he.meses[0].horas === '100', 'precursor especial: su casilla, no la de regular, y sus horas cuentan');
revisar(JSON.stringify(faltantesS21(null)) === '["sexo","nacimiento","bautismo","esperanza"]' && faltantesS21({ sexo: 'Hombre', fecha_nacimiento: 'x', fecha_bautismo: 'x', esperanza: 'Ungido' }).length === 0, 'faltantes');

// ── PDF de todos: 100 personas ──
const hojas = Array.from({ length: 100 }, (_, i) => armarHojaS21({ nombre: `Publicador ${i + 1}`, tipo_publicador: 'Publicador' }, { sexo: i % 2 ? 'Hombre' : 'Mujer' }, inf, 2026));
const t0 = Date.now();
const todos = await s21Todos(plantilla, hojas);
const seg = (Date.now() - t0) / 1000;
const docT = await PDFDocument.load(todos);
const contenidos = docT.getPages().map(p => p.node.get(PDFName.of('Contents')).toString());
revisar(docT.getPageCount() === 100, `todos: 100 hojas (${docT.getPageCount()})`);
revisar(new Set(contenidos).size === 100, 'todos: cada hoja con su propio contenido (no se encima el texto de otra persona)');
revisar(todos.length < 3_000_000, `todos: archivo ligero (${(todos.length / 1e6).toFixed(2)} MB para 100) en ${seg.toFixed(1)} s`);
revisar(docT.getPages().every(p => { const a = docT.context.lookup(p.node.get(PDFName.of('Annots'))); return !a || a.size() === 0; }), 'todos: sin campos vacíos encima');

// ── PDF editable de una persona ──
const uno = await PDFDocument.load(await s21Editable(plantilla, h));
const f = uno.getForm();
revisar(f.getTextField('900_1_Text_SanSerif').getText() === 'Ana López' && f.getTextField('900_13_Text_C_SanSerif').getText() === '2026', 'una persona: nombre y año en sus campos');
revisar(f.getCheckBox('900_4_CheckBox').isChecked() && !f.getCheckBox('900_3_CheckBox').isChecked() && f.getCheckBox('901_20_CheckBox').isChecked() && f.getCheckBox('903_21_CheckBox').isChecked(), 'una persona: casillas (Mujer, participó, auxiliar)');
revisar(f.getTextField('904_21_S21_Value').getText() === '30' && f.getTextField('904_32_S21_Value').getText() === '30' && f.getTextField('902_20_Text_C_SanSerif').getText() === '2', 'una persona: horas, total y cursos en sus campos (editable)');

// ── La ventana en la app ──
const miembros = [
  { id: 1, nombre: 'Anciano Secretario', rol: 'Anciano', tipo_publicador: 'Publicador', activo: true },
  { id: 2, nombre: 'Ana López', rol: 'Publicador', tipo_publicador: 'Precursor auxiliar', activo: true },
  { id: 3, nombre: 'Beto Ruiz', rol: 'Ministerial', tipo_publicador: 'Precursor regular', activo: true },
  { id: 4, nombre: 'Inactivo', rol: 'Publicador', tipo_publicador: 'Publicador', activo: false },
];
const registrosBD = [{ usuario_id: 2, sexo: 'Mujer', fecha_nacimiento: '1990-02-03', fecha_bautismo: '2004-06-07', esperanza: 'Otras ovejas' }];
const mesAct = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();
const informesBD = [{ usuario_id: 2, mes: mesAct, tipo_publicador: 'Precursor auxiliar', predico: true, estudios: 1, horas: 31, horas_servicio_sagrado: 0, comentarios: '' }];
const escrituras = [];
let sinMigracion15 = false;
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DESC });
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = new URL(req.url());
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname.startsWith('/functions/')) return json(404, {});
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  const tabla = u.pathname.split('/').pop();
  if (req.method() === 'POST' && tabla === 'publicador_registro') { escrituras.push(`${decodeURIComponent(u.search)} ${req.postData()}`); return json(201, []); }
  if (req.method() !== 'GET') return json(201, []);
  if (tabla === 'publicador_registro') return sinMigracion15 ? json(404, { code: 'PGRST205', message: 'Could not find the table' }) : json(200, registrosBD);
  if (tabla === 'app_usuarios') return json(200, miembros);
  if (tabla === 'informes_servicio') return json(200, informesBD);
  if (tabla === 'congregaciones') return json(200, [{ id: 'c1', nombre: 'Centro' }]);
  return json(200, []);
});
const entrar = async (rol) => {
  await page.evaluateOnNewDocument((r) => {
    localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Secretario', usuario: 's', rol: r, congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    sessionStorage.setItem('notif_banner_dismissed', 'true');
  }, rol);
};
const ir = async () => {
  await page.goto(`${BASE}/informes`, { waitUntil: 'networkidle2' }); await espera(1000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Congregación')?.click());
  await espera(1200);
};
const botonS21 = () => page.evaluate(() => !![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'S-21'));
const texto = () => page.evaluate(() => document.body.innerText);
const archivos = () => fs.readdirSync(DESC).filter(f => !f.endsWith('.crdownload'));
const esperarArchivo = async (antes, patron) => {
  for (let i = 0; i < 60; i++) { await espera(250); const n = archivos().find(f => !antes.has(f) && patron.test(f)); if (n) { await espera(300); return path.join(DESC, n); } }
  return null;
};

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await entrar('Ministerial');
await ir();
revisar(!(await botonS21()), 'Ministerial: no ve el botón S-21 (datos personales)');
const p2 = await browser.newPage(); await p2.close();
await page.evaluateOnNewDocument(() => { localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Secretario', usuario: 's', rol: 'Anciano', congregacion_id: 'c1', congregacion_nombre: 'Centro' })); });
await ir();
revisar(await botonS21(), 'Anciano (secretario): ve el botón S-21');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'S-21')?.click());
await espera(1500);
let t = await texto();
revisar(t.includes('Registro de publicador (S-21)') && t.includes('Descargar todos (3)') && !t.includes('Inactivo'), 'ventana: 3 miembros activos (el inactivo no)');
revisar(/A 2 les faltan datos/.test(t) && t.includes('Completo'), 'avisa a quiénes les faltan datos');
revisar(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'ventana 390px: sin scroll horizontal');
await page.screenshot({ path: `${OUT}/s21-ventana-390.png` });
// Capturar datos de Beto
await page.evaluate(() => { const li = [...document.querySelectorAll('li')].find(l => l.textContent.includes('Beto Ruiz')); [...li.querySelectorAll('button')].find(b => b.title === 'Datos')?.click(); });
await espera(400);
revisar((await texto()).includes('Siervo ministerial'), 'el nombramiento se sugiere por el rol (Ministerial → Siervo ministerial)');
await page.evaluate(() => {
  const li = [...document.querySelectorAll('li')].find(l => l.textContent.includes('Beto Ruiz'));
  const fechas = li.querySelectorAll('input[type=date]');
  const poner = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  poner(fechas[0], '1988-04-05'); poner(fechas[1], '2003-10-11');
  [...li.querySelectorAll('button')].find(b => b.textContent.trim() === 'Hombre')?.click();
});
await espera(200);
await page.evaluate(() => { const li = [...document.querySelectorAll('li')].find(l => l.textContent.includes('Beto Ruiz')); [...li.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar')?.click(); });
await espera(1000);
const w = escrituras.find(e => e.includes('"usuario_id":3'));
revisar(!!w && w.includes('on_conflict=usuario_id') && w.includes('"sexo":"Hombre"') && w.includes('"fecha_nacimiento":"1988-04-05"') && w.includes('"nombramiento":"Siervo ministerial"') && w.includes('"esperanza":"Otras ovejas"'), `guardar datos: upsert correcto (${w?.slice(0, 160)})`);
// Descargar todos
let antes = new Set(archivos());
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Descargar todos'))?.click());
const fTodos = await esperarArchivo(antes, /^S-21_\d{4}_todos\.pdf$/);
const dTodos = fTodos && await PDFDocument.load(fs.readFileSync(fTodos));
revisar(dTodos?.getPageCount() === 3, `descargar todos: un PDF con 3 hojas (${fTodos ? path.basename(fTodos) : 'no descargó'})`);
// Una persona
antes = new Set(archivos());
await page.evaluate(() => { const li = [...document.querySelectorAll('li')].find(l => l.textContent.includes('Ana López')); [...li.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF')?.click(); });
const fUno = await esperarArchivo(antes, /^S-21_\d{4}_Ana_Lopez\.pdf$/);
if (fUno) {
  const fu = (await PDFDocument.load(fs.readFileSync(fUno))).getForm();
  const i = (Number(mesAct.slice(5, 7)) + 3) % 12; // fila del mes actual (septiembre = 0)
  revisar(fu.getTextField('900_1_Text_SanSerif').getText() === 'Ana López' && fu.getTextField('900_2_Text_SanSerif').getText() === '03/02/1990'
    && fu.getTextField(`904_${20 + i}_S21_Value`).getText() === '31' && fu.getCheckBox(`903_${20 + i}_CheckBox`).isChecked(), 'PDF de una persona: con sus datos y su informe del mes en el renglón correcto');
} else revisar(false, 'PDF de una persona: no descargó');
// Sin la Migración 15
sinMigracion15 = true;
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Cerrar')?.click());
await espera(300);
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'S-21')?.click());
await espera(1500);
t = await texto();
revisar(t.includes('Falta correr la Migración 15') && t.includes('Descargar todos (3)'), 'sin la Migración 15: avisa y aun así genera (sin datos personales)');

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
