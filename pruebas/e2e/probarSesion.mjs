// Paso 1 del blindaje: login en el servidor (Edge Function `sesion`) + token firmado en cada consulta.
// Corre el código REAL de las funciones `sesion` y `webauthn` en Node. Un "PostgREST" falso verifica
// los tokens igual que Supabase (acepta solo la llave configurada). Supabase real NUNCA se toca.
import puppeteer from 'puppeteer-core';
import { NAVEGADOR } from '../apoyo/navegador.mjs';
import http from 'http';
import * as jose from 'jose';
import { cargarFuncion, entorno } from '../apoyo/cargarFuncion.mjs';

const [, , OUT, RAIZ] = process.argv;
const BASE = 'http://localhost:4173';
const PUBLICA = 'sb_publishable_prueba';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [], fallo = [], logs = [];
const revisar = (c, txt) => { (c ? ok : fallo).push(txt); console.log((c ? "OK  " : "MAL ") + txt); };

// ── "Supabase": qué llave acepta para verificar tokens ──
const SECRETO = 'secreto-legacy-de-prueba-con-mas-de-32-caracteres';
const parES = await jose.generateKeyPair('ES256', { extractable: true });
const jwkPriv = { ...(await jose.exportJWK(parES.privateKey)), kid: 'llave-propia-1' };
let acepta = 'hs256'; // 'hs256' | 'es256' | 'nada'
async function verificarComoSupabase(auth) {
  if (!auth || /^Bearer sb_publishable_/.test(auth)) return { ok: true, rol: 'anon(llave)' };
  const token = auth.replace('Bearer ', '');
  try {
    const llave = acepta === 'hs256' ? new TextEncoder().encode(SECRETO) : acepta === 'es256' ? parES.publicKey : null;
    if (!llave) throw new Error('sin llave');
    const { payload } = await jose.jwtVerify(token, llave);
    return { ok: true, rol: payload.role, payload };
  } catch {
    return { ok: false };
  }
}
const pgrst = http.createServer(async (req, res) => {
  const v = await verificarComoSupabase(req.headers.authorization);
  res.writeHead(v.ok ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(v.ok ? '[{"id":"c1"}]' : '{"code":"PGRST301","message":"JWSError JWSInvalidSignature"}');
});
await new Promise(r => pgrst.listen(0, r));
const URL_PG = `http://127.0.0.1:${pgrst.address().port}`;

let fnSesion = null; // null = sin desplegar
let fnWebauthn = null;
let db;
const cargar = async (cfg) => {
  for (const k of ['SESION_JWT_SECRET', 'SESION_JWK_PRIVADA']) delete entorno[k];
  const base = { SUPABASE_URL: URL_PG, SUPABASE_SERVICE_ROLE_KEY: 'x', ...cfg };
  fnSesion = (await cargarFuncion(`${RAIZ}/supabase/functions/sesion/index.ts`, base)).handler;
  const w = await cargarFuncion(`${RAIZ}/supabase/functions/webauthn/index.ts`, base);
  fnWebauthn = w.handler; db = w.db;
};
await cargar({});
const reiniciarDB = () => {
  db.app_usuarios = [{ id: 7, usuario: 'dani', nombre: 'Daniel', password: '1234', rol: 'Anciano', congregacion_id: 'c1', grupo_id: 3, activo: true, foto_url: null }];
  db.congregaciones = [{ id: 'c1', nombre: 'Centro' }];
  db.webauthn_credenciales = []; db.webauthn_retos = []; db.sinMigracion = false;
};
reiniciarDB();

// ── Navegador ──
const llamadas = [];
const authREST = []; // Authorization de cada consulta de datos de la app
let consultasPassword = 0;
const browser = await puppeteer.launch({
  executablePath: NAVEGADOR, headless: 'new',
  args: ['--host-resolver-rules=MAP *.supabase.co 127.0.0.1'],
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
  const fn = u.pathname === '/functions/v1/sesion' ? fnSesion : u.pathname === '/functions/v1/webauthn' ? fnWebauthn : undefined;
  if (fn !== undefined) {
    if (!fn) return json(404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    const r = await fn(new Request('https://x.supabase.co' + u.pathname, {
      method: 'POST', headers: { origin: req.headers().origin || BASE, apikey: req.headers().apikey || '', 'content-type': 'application/json' }, body: req.postData(),
    }));
    const cuerpo = await r.text();
    llamadas.push(`${u.pathname.split('/').pop()} ${JSON.parse(req.postData()).accion} → ${r.status} ${cuerpo.slice(0, 70)}`);
    return req.respond({ status: r.status, headers: { ...cors, 'Content-Type': 'application/json' }, body: cuerpo });
  }
  // Datos: verificar el token como Supabase
  const auth = req.headers().authorization;
  const v = await verificarComoSupabase(auth);
  authREST.push({ ruta: u.pathname, auth, ok: v.ok, rol: v.rol });
  if (!v.ok) return json(401, { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' });
  const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (u.pathname.endsWith('/app_usuarios') && req.method() === 'GET' && u.searchParams.get('password')) {
    consultasPassword++;
    const f = db.app_usuarios.find(x => `eq.${x.usuario}` === u.searchParams.get('usuario') && `eq.${x.password}` === u.searchParams.get('password'));
    return f ? json(200, objeto ? f : [f]) : json(406, { code: 'PGRST116' });
  }
  if (u.pathname.endsWith('/congregaciones')) return json(200, objeto ? db.congregaciones[0] : db.congregaciones);
  if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...cors, 'Content-Range': '*/0' }, body: '' });
  return json(200, objeto ? {} : []);
});

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((p) => {
  try { localStorage.setItem('pwa_install_dismissed_at', String(Date.now())); sessionStorage.setItem('notif_banner_dismissed', 'true'); } catch { /* */ }
  window.__PUBLICA = p;
}, PUBLICA);
const ir = async (ruta) => { await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' }); await espera(1200); };
const salir = () => page.evaluate(() => { localStorage.removeItem('territorial_user'); localStorage.removeItem('territorial_token'); sessionStorage.removeItem('biometria_estado'); });
const entrar = async (usuario, pass) => {
  await ir('/login');
  await page.type('input[autocomplete=username]', usuario);
  await page.type('input[type=password]', pass);
  await page.click('button[type=submit]');
  await espera(2500);
};
const errorLogin = () => page.evaluate(() => [...document.querySelectorAll('div')].find(d => d.className.includes('animate-fade-in') && d.style.color)?.innerText || '');
const sesion = () => page.evaluate(() => ({ user: JSON.parse(localStorage.getItem('territorial_user') || 'null'), tok: JSON.parse(localStorage.getItem('territorial_token') || 'null') }));
const decodificar = (t) => ({ h: jose.decodeProtectedHeader(t), p: jose.decodeJwt(t) });
const authDespues = (i) => authREST.slice(i).filter(a => !a.ruta.endsWith('/congregaciones') || true);

// ¿La app de prueba usa la llave pública real del .env? (para comparar el Authorization)
await ir('/login');

// A) Función `sesion` sin desplegar → login de siempre, sin token
fnSesion = null;
let i0 = authREST.length;
await entrar('dani', '1234');
let s = await sesion();
revisar(s.user?.id === 7 && !s.tok && consultasPassword === 1, `A sin función: entra con el login de siempre (consultas con contraseña: ${consultasPassword})`);
const llavePublicaApp = authREST[i0]?.auth;
revisar(authDespues(i0).every(a => a.auth === llavePublicaApp), 'A: todas las consultas con la llave pública');
await salir();

// B) Función sin secreto → se revisa en el servidor, sin token
await cargar({});
consultasPassword = 0;
await entrar('dani', '1234');
s = await sesion();
revisar(s.user?.id === 7 && s.user.congregacion_nombre === 'Centro' && !s.tok && consultasPassword === 0, 'B sin secreto: entra por el servidor (sin consulta de contraseña desde el navegador) y sin token');
revisar(!('password' in (s.user || {})) && !('grupo_id' in (s.user || {})), 'B: la sesión guarda los mismos campos de siempre');
await salir();

// C) Con secreto legacy (HS256) que Supabase acepta → token en cada consulta
acepta = 'hs256';
await cargar({ SESION_JWT_SECRET: SECRETO });
i0 = authREST.length;
await entrar('dani', '1234');
s = await sesion();
revisar(!!s.tok?.token && consultasPassword === 0, 'C HS256: hay token');
if (s.tok?.token) {
  const { h, p } = decodificar(s.tok.token);
  revisar(h.alg === 'HS256' && p.role === 'anon' && p.usuario_id === 7 && p.congregacion_id === 'c1' && p.app_rol === 'Anciano' && p.grupo_id === 3 && p.iss === 'gestion-territorial' && p.exp - p.iat === 30 * 86400,
    `C: contenido del token ${JSON.stringify({ alg: h.alg, ...p })}`);
  const conToken = authDespues(i0).filter(a => a.auth === `Bearer ${s.tok.token}`);
  revisar(conToken.length > 0 && authDespues(i0).filter(a => a.auth !== `Bearer ${s.tok.token}` && !a.ruta.includes('functions')).length <= 1,
    `C: consultas después de entrar usan el token (${conToken.length} con token)`);
  revisar(authDespues(i0).every(a => a.ok), 'C: Supabase aceptó todas');
}
// Recargar la página: el token sigue y se usa
i0 = authREST.length;
await ir('/');
s = await sesion();
revisar(authREST.slice(i0).length > 0 && authREST.slice(i0).every(a => a.auth === `Bearer ${s.tok?.token}`), `C: tras recargar, todas las consultas con token (${authREST.slice(i0).length})`);

// D) Token que Supabase ya no acepta (llave cambiada) → se olvida y se repite con la llave pública
acepta = 'nada';
i0 = authREST.length;
await ir('/');
s = await sesion();
const rech = authREST.slice(i0).filter(a => !a.ok).length;
revisar(!s.tok && s.user?.id === 7 && rech >= 1, `D llave cambiada: token olvidado, sesión sigue (rechazadas ${rech}, luego con llave pública)`);
revisar(authREST.slice(i0).filter(a => a.ok).length >= 1, 'D: las consultas repetidas con la llave pública sí cargan');
await salir();

// E) Secreto que Supabase NO acepta → la función no entrega token (prueba previa)
await cargar({ SESION_JWT_SECRET: 'otro-secreto-que-supabase-no-conoce-123456' });
acepta = 'hs256';
await entrar('dani', '1234');
s = await sesion();
revisar(s.user?.id === 7 && !s.tok, 'E secreto equivocado: entra pero sin token (la app sigue como hoy)');
await salir();

// F) Contraseña mala / cuenta desactivada
await cargar({ SESION_JWT_SECRET: SECRETO });
consultasPassword = 0;
await entrar('dani', '9999');
revisar(/incorrectos/.test(await errorLogin()) && !(await sesion()).user && consultasPassword === 0, 'F contraseña mala: error y sin respaldo al login directo');
db.app_usuarios[0].activo = false;
await entrar('dani', '1234');
revisar(/desactivada/.test(await errorLogin()) && !(await sesion()).user, 'F cuenta desactivada: no entra');
db.app_usuarios[0].activo = true;

// G) Renovación al abrir (token de hace 2 días): trae el rol nuevo y token nuevo
await entrar('dani', '1234');
s = await sesion();
const viejo = s.tok?.token;
await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('territorial_token')); t.obtenido = Date.now() - 2 * 86400000; localStorage.setItem('territorial_token', JSON.stringify(t)); });
db.app_usuarios[0].rol = 'Admin Principal';
await espera(1100); // iat distinto
await ir('/');
s = await sesion();
revisar(s.tok?.token && s.tok.token !== viejo && decodificar(s.tok.token).p.app_rol === 'Admin Principal' && s.user.rol === 'Admin Principal', `G renovación: token nuevo y rol al día (${s.user?.rol})`);
// Sin pasar un día no renueva
const nLlam = llamadas.length;
await ir('/');
revisar(!llamadas.slice(nLlam).some(l => l.includes('renovar')), 'G: no renueva si no ha pasado un día');
db.app_usuarios[0].rol = 'Anciano';

// H) Cuenta desactivada mientras tenía sesión → al renovar se cierra
await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('territorial_token')); t.obtenido = 0; localStorage.setItem('territorial_token', JSON.stringify(t)); });
db.app_usuarios[0].activo = false;
await ir('/');
await espera(1000);
s = await sesion();
revisar(!s.user && !s.tok && page.url().includes('/login'), `H desactivada: sesión cerrada (${page.url()})`);
db.app_usuarios[0].activo = true;

// I) Token falsificado (firmado con otra llave) → renovar lo rechaza
const falso = await new jose.SignJWT({ role: 'anon', usuario_id: 7 }).setProtectedHeader({ alg: 'HS256' }).setIssuer('gestion-territorial').setExpirationTime('1d').sign(new TextEncoder().encode('llave-de-un-atacante-con-32-caracteres!!'));
const rI = await fnSesion(new Request('https://x/f', { method: 'POST', headers: { apikey: PUBLICA }, body: JSON.stringify({ accion: 'renovar', token: falso }) }));
revisar(rI.status === 401 && (await rI.json()).error === 'token_invalido', `I token falsificado rechazado (${rI.status})`);

// J) Llave propia ES256 (con kid) en vez del secreto legacy
acepta = 'es256';
await cargar({ SESION_JWK_PRIVADA: JSON.stringify(jwkPriv) });
await salir();
await entrar('dani', '1234');
s = await sesion();
const dj = s.tok?.token && decodificar(s.tok.token);
revisar(dj && dj.h.alg === 'ES256' && dj.h.kid === 'llave-propia-1' && dj.p.usuario_id === 7, `J ES256: token con kid (${JSON.stringify(dj?.h)})`);
const rJ = await fnSesion(new Request('https://x/f', { method: 'POST', headers: { apikey: PUBLICA }, body: JSON.stringify({ accion: 'renovar', token: s.tok?.token }) }));
revisar(rJ.status === 200 && !!(await rJ.json()).token, 'J: renovar con ES256');

// K) Entrar con huella también entrega token
const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable', { enableUI: false });
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await ir('/profile');
await page.type('input[placeholder="Tu contraseña actual"]', '1234');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Activar (huella|Face ID)/.test(b.textContent))?.click());
await espera(2500);
revisar(db.webauthn_credenciales.length === 1, 'K: huella activada');
await salir();
await ir('/login');
await page.click('button[aria-label^="Entrar con"]');
await espera(3000);
s = await sesion();
const dk = s.tok?.token && decodificar(s.tok.token);
revisar(s.user?.id === 7 && dk?.h.alg === 'ES256' && dk.p.usuario_id === 7, 'K: entrar con huella guarda el token firmado');

await browser.close();
pgrst.close();
console.log('LLAMADAS:\n' + llamadas.join('\n'));
console.log('\nOK:\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
console.log('\nLOGS:\n' + (logs.join('\n') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
