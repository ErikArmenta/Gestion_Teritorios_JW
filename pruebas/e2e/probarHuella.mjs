// Entrar con huella (WebAuthn) de punta a punta: lector virtual de Edge (CDP) + el código REAL de la
// Edge Function corriendo en Node con un Supabase en memoria. Supabase real NUNCA se toca.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR, ARGS_EXTRA } from '../apoyo/navegador.mjs';
import { cargarFuncion } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, INDEX] = process.argv;
const BASE = 'http://localhost:4173';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const logs = [];
const ok = [];
const fallo = [];
const revisar = (cond, txt) => (cond ? ok : fallo).push(txt);

const { handler, db } = await cargarFuncion(INDEX, { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' });
const reiniciarDB = () => {
  db.app_usuarios = [{ id: 7, usuario: 'dani', nombre: 'Daniel', password: '1234', rol: 'Anciano', congregacion_id: 'c1', activo: true, foto_url: null }];
  db.congregaciones = [{ id: 'c1', nombre: 'Centro' }];
  db.webauthn_credenciales = []; db.webauthn_retos = []; db.sinMigracion = false;
};
reiniciarDB();
let ultimoLoginVerificar = null;
const llamadas = [];

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
  const u = new URL(url);
  const json = (status, body) => req.respond({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname === '/functions/v1/webauthn') {
    const origin = req.headers().origin || BASE;
    const r = await handler(new Request('https://x.supabase.co/functions/v1/webauthn', {
      method: req.method(), headers: { origin, 'content-type': 'application/json' },
      body: req.method() === 'POST' ? req.postData() : undefined,
    }));
    const cuerpo = await r.text();
    if (req.method() === 'POST') {
      const b = JSON.parse(req.postData());
      llamadas.push(`${b.accion} → ${r.status} ${cuerpo.slice(0, 80)}`);
      if (b.accion === 'login-verificar') ultimoLoginVerificar = req.postData();
    }
    return req.respond({ status: r.status, headers: Object.fromEntries(r.headers), body: cuerpo });
  }
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (u.pathname.endsWith('/app_usuarios') && req.method() === 'GET') {
    const usuario = u.searchParams.get('usuario')?.replace('eq.', '');
    const pass = u.searchParams.get('password')?.replace('eq.', '');
    const f = db.app_usuarios.find(x => x.usuario === usuario && x.password === pass);
    if (usuario) return f ? json(200, objeto ? f : [f]) : json(406, { code: 'PGRST116', message: '0 rows' });
    return json(200, objeto ? db.app_usuarios[0] : db.app_usuarios);
  }
  if (u.pathname.endsWith('/congregaciones')) return json(200, objeto ? db.congregaciones[0] : db.congregaciones);
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  return json(200, objeto ? {} : []);
});

const prep = async (ancho, tema = 'light', usuario = null) => {
  await page.setViewport(ancho < 768 ? { width: ancho, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: ancho, height: 900 });
  await page.evaluateOnNewDocument((u, tema) => {
    try {
      if (u) localStorage.setItem('territorial_user', JSON.stringify(u));
      localStorage.setItem('theme', tema);
      localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
      sessionStorage.setItem('notif_banner_dismissed', 'true');
    } catch { /* sin storage */ }
  }, usuario, tema);
};
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1200); };
const botonBio = () => page.$('button[aria-label^="Entrar con"]');
const errorLogin = () => page.evaluate(() => [...document.querySelectorAll('div')].find(d => d.className.includes('animate-fade-in') && d.style.color)?.innerText || '');
const textoPag = () => page.evaluate(() => document.body.innerText);
const clic = (txt) => page.evaluate((x) => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().includes(x)); b?.click(); return !!b; }, txt);
const limpiarSesion = () => page.evaluate(() => { localStorage.removeItem('territorial_user'); sessionStorage.removeItem('biometria_estado'); });

// 1) Sin lector en el aparato → sin botón
await prep(360);
await ir('/login');
revisar(!(await botonBio()), 'sin lector: no hay botón');

// Lector virtual tipo "huella del teléfono"
const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable', { enableUI: false });
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

// 2) Lector sí, servidor sin Migración 10 → sin botón
db.sinMigracion = true;
await page.evaluate(() => sessionStorage.removeItem('biometria_estado'));
await ir('/login');
revisar(!(await botonBio()), 'sin migración: no hay botón');
db.sinMigracion = false;

// 3) Todo listo → botón junto a "Iniciar Sesión"
await page.evaluate(() => sessionStorage.removeItem('biometria_estado'));
await ir('/login');
const b = await botonBio();
revisar(!!b, 'con lector y migración: aparece el botón');
const geo = await page.evaluate(() => {
  const bio = document.querySelector('button[aria-label^="Entrar con"]').getBoundingClientRect();
  const sub = document.querySelector('button[type=submit]').getBoundingClientRect();
  return { mismaFila: Math.abs(bio.top - sub.top) < 2, izq: bio.right <= sub.left, alto: [bio.height, sub.height], scroll: document.documentElement.scrollWidth > innerWidth };
});
revisar(geo.mismaFila && geo.izq && !geo.scroll, `botón a la izquierda en la misma fila, sin scroll (${JSON.stringify(geo)})`);
await page.screenshot({ path: `${OUT}/huella-login-360.png` });

// 4) Tocar sin haberla activado → aviso
await b.click();
await espera(2500);
const e1 = await errorLogin();
revisar(/activa|huella/i.test(e1), `sin activar: aviso "${e1}"`);

// 5) Entrar con contraseña → Mi Perfil → activar
await page.type('input[autocomplete=username]', 'dani');
await page.type('input[type=password]', '1234');
await page.click('button[type=submit]');
await espera(2000);
await ir('/profile');
let t = await textoPag();
revisar(t.includes('Entrar con huella o Face ID'), 'perfil: aparece la tarjeta');
await clic('Face ID');
revisar(await page.evaluate(() => localStorage.getItem('biometria_icono')) === 'rostro', 'elegir Face ID se guarda');
await page.type('input[placeholder="Tu contraseña actual"]', '9999');
await clic('Activar Face ID');
await espera(1500);
t = await textoPag();
revisar(t.includes('La contraseña no es correcta') && db.webauthn_credenciales.length === 0, 'contraseña mala: no se activa');
await page.$eval('input[placeholder="Tu contraseña actual"]', (i) => { i.value = ''; });
await page.click('input[placeholder="Tu contraseña actual"]', { clickCount: 3 });
await page.keyboard.press('Backspace');
await page.type('input[placeholder="Tu contraseña actual"]', '1234');
await clic('Activar Face ID');
await espera(2500);
t = await textoPag();
const cred = db.webauthn_credenciales[0];
revisar(t.includes('Activada en este dispositivo') && cred?.usuario_id === 7 && cred.llave_publica?.length > 50, `activada: credencial guardada (${cred?.dispositivo})`);
revisar(!db.webauthn_retos.some(r => r.tipo === 'registro'), 'el reto de registro se consumió');
revisar(await page.evaluate(() => !!localStorage.getItem('biometria:7')), 'marca local guardada');
await page.screenshot({ path: `${OUT}/huella-perfil-360.png`, fullPage: true });

// 6) Cerrar sesión → entrar con Face ID
await limpiarSesion();
await ir('/login');
const icono = await page.evaluate(() => document.querySelector('button[aria-label^="Entrar con"]')?.getAttribute('aria-label'));
revisar(icono === 'Entrar con Face ID', `botón dice Face ID (${icono})`);
await (await botonBio()).click();
await espera(3000);
const sesion = await page.evaluate(() => JSON.parse(localStorage.getItem('territorial_user') || 'null'));
revisar(sesion?.id === 7 && sesion.congregacion_nombre === 'Centro' && sesion.rol === 'Anciano' && !('password' in sesion), `entró con huella: ${JSON.stringify(sesion)}`);
revisar(!page.url().endsWith('/login'), `salió del login (${page.url()})`);
revisar(db.webauthn_credenciales[0].usado_en && db.webauthn_retos.length === 1, `usado_en actualizado; solo queda el reto abandonado del paso 4 (${db.webauthn_retos.length})`);
db.webauthn_retos.forEach(r => { r.expira_en = new Date(Date.now() - 60000).toISOString(); });
const vencidos = db.webauthn_retos.map(r => r.id);
await handler(new Request('https://x/f', { method: 'POST', headers: { origin: BASE }, body: '{"accion":"login-opciones"}' }));
revisar(!db.webauthn_retos.some(r => vencidos.includes(r.id)), 'retos vencidos se limpian');

// 7) Repetir la misma firma (replay) → rechazado
const r7 = await handler(new Request('https://x/f', { method: 'POST', headers: { origin: BASE }, body: ultimoLoginVerificar }));
revisar(r7.status === 400 && (await r7.json()).error === 'reto_invalido', `replay rechazado (${r7.status})`);

// 8) Origen no permitido → 403
const r8 = await handler(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://malo.com' }, body: '{"accion":"login-opciones"}' }));
revisar(r8.status === 403, `origen ajeno rechazado (${r8.status})`);

// 9) Registro sin contraseña / usuario ajeno → 401
const r9 = await handler(new Request('https://x/f', { method: 'POST', headers: { origin: BASE }, body: JSON.stringify({ accion: 'registro-opciones', usuario_id: 7, password: '' }) }));
revisar(r9.status === 400 || r9.status === 401, `registro sin contraseña rechazado (${r9.status})`);

// 10) Cuenta desactivada → no entra
await limpiarSesion();
db.app_usuarios[0].activo = false;
await ir('/login');
await (await botonBio()).click();
await espera(2500);
const e10 = await errorLogin();
revisar(/desactivada/.test(e10) && !(await page.evaluate(() => localStorage.getItem('territorial_user'))), `desactivada: "${e10}"`);
db.app_usuarios[0].activo = true;

// 11) Huella borrada en el servidor → aviso
const respaldo = [...db.webauthn_credenciales];
db.webauthn_credenciales = [];
await ir('/login');
await (await botonBio()).click();
await espera(2500);
const e11 = await errorLogin();
revisar(/ya no está registrada/.test(e11), `huella borrada: "${e11}"`);
db.webauthn_credenciales = respaldo;

// 12) Quitar desde Mi Perfil (modo oscuro)
await prep(360, 'dark', { id: 7, nombre: 'Daniel', usuario: 'dani', rol: 'Anciano', congregacion_id: 'c1', congregacion_nombre: 'Centro' });
await ir('/profile');
await page.evaluate(() => document.querySelector('.card:nth-of-type(2)')?.scrollIntoView());
await page.screenshot({ path: `${OUT}/huella-perfil-oscuro-360.png`, fullPage: true });
await clic('Quitar');
await espera(500);
await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === 'Quitar'); bs[bs.length - 1]?.click(); });
await espera(1500);
revisar(db.webauthn_credenciales.length === 0 && !(await page.evaluate(() => localStorage.getItem('biometria:7'))), 'quitar: borrada en servidor y en el aparato');
revisar((await textoPag()).includes('Activar Face ID'), 'quitar: vuelve a ofrecer activar');

// 13) Escritorio
await prep(1280, 'light');
await limpiarSesion();
await ir('/login');
await page.screenshot({ path: `${OUT}/huella-login-1280.png` });

await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
await browser.close();
console.log('LLAMADAS:\n' + llamadas.join('\n'));
console.log('\nOK:\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
