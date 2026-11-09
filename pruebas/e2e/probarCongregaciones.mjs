// Congregaciones (Super Admin): lista con conteos SIN conteo embebido (con el blindaje fallaba y salía vacía),
// crear refresca la lista y un error se muestra en vez de esconderse.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';

const [, , OUT] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const congregaciones = [{ id: 'c1', nombre: 'Centro', clave: 'CEN' }, { id: 'c2', nombre: 'Mitla', clave: 'MIT' }];
const conteos = { app_usuarios: { c1: 12, c2: 5 }, territorios: { c1: 30, c2: 0 } };
const consultas = [];
let falla = false;
const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: 'new', args: [...ARGS_EXTRA, '--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = new URL(req.url());
  if (!u.hostname.endsWith('supabase.co')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const json = (status, body, extra = {}) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  if (u.pathname.startsWith('/functions/')) return json(404, {});
  const tabla = u.pathname.split('/').pop();
  const select = u.searchParams.get('select') || '';
  if (tabla === 'congregaciones') consultas.push(`${req.method()} ${select}`);
  // Como el Supabase blindado: el conteo embebido de app_usuarios falla
  if (tabla === 'congregaciones' && /\(count\)/.test(select)) return json(401, { code: '42501', message: 'permission denied for table app_usuarios' });
  if (req.method() === 'HEAD' && conteos[tabla]) {
    const n = conteos[tabla][(u.searchParams.get('congregacion_id') || '').replace('eq.', '')] ?? 0;
    return req.respond({ status: 200, headers: { ...cors, 'Content-Range': n ? `0-${n - 1}/${n}` : '*/0' }, body: '' });
  }
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  if (tabla === 'congregaciones' && req.method() === 'POST') { congregaciones.push({ id: 'c3', ...JSON.parse(req.postData())[0] }); return json(201, []); }
  if (tabla === 'congregaciones' && falla) return json(500, { code: 'XX000', message: 'falla de prueba' });
  if (tabla === 'congregaciones') return json(200, [...congregaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  return json(200, []);
});
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('territorial_user', JSON.stringify({ id: 1, nombre: 'Súper', usuario: 's', rol: 'Super Admin', congregacion_id: 'c1', congregacion_nombre: 'Centro' }));
  localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
  sessionStorage.setItem('notif_banner_dismissed', 'true');
});
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/congregaciones`, { waitUntil: 'networkidle2' });
await espera(1500);
let t = await page.evaluate(() => document.body.innerText);
revisar(t.includes('Centro') && t.includes('Mitla') && !t.includes('No hay congregaciones registradas'), 'la lista sale (antes salía vacía)');
revisar(!consultas.some(c => /\(count\)/.test(c)), 'ya no usa el conteo embebido');
const filas = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
revisar(filas.some(f => /Centro.*12.*30/.test(f)) && filas.some(f => /Mitla.*5.*0/.test(f)), `conteos de usuarios y territorios (${filas.join(' | ')})`);
// Crear → aparece
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Nueva Congregación'))?.click());
await espera(500);
await page.type('form input', 'Zaachila');
await page.evaluate(() => document.querySelector('form button[type=submit]')?.click());
await espera(1500);
t = await page.evaluate(() => document.body.innerText);
revisar(t.includes('Zaachila'), 'crear: la nueva aparece en la lista');
// Error → se avisa
falla = true;
await page.reload({ waitUntil: 'networkidle2' });
await espera(1500);
t = await page.evaluate(() => document.body.innerText);
revisar(t.includes('Error al cargar') && t.includes('falla de prueba'), 'si la consulta falla, se avisa (no se esconde)');
await page.screenshot({ path: `${OUT}/congregaciones.png` });

await browser.close();
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
