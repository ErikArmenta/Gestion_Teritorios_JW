// Corre todas las pruebas. Uso:  npm run build  →  npm run pruebas
// (o una sola: npm run pruebas -- sesion). Supabase NUNCA se toca: todo va interceptado o en un Postgres
// de prueba en memoria (PGlite). Levanta `vite preview` en el 4173 si no está corriendo.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'pruebas', 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

// Orden: probarReportes deja la plantilla que usa probarIntentos
const PRUEBAS = [
  { nombre: 'textos', archivo: 'estatico/probarTextos.mjs', args: [RAIZ] },
  { nombre: 'migracion11', archivo: 'sql/probarMigracion11.mjs', args: [RAIZ] },
  { nombre: 'blindaje', archivo: 'sql/probarBlindaje.mjs', args: [RAIZ] },
  { nombre: 'candados', archivo: 'sql/probarCandados.mjs', args: [RAIZ] },
  { nombre: 'huella', archivo: 'e2e/probarHuella.mjs', args: [SALIDA, path.join(RAIZ, 'supabase/functions/webauthn/index.ts')], app: true },
  { nombre: 'sesion', archivo: 'e2e/probarSesion.mjs', args: [SALIDA, RAIZ], app: true },
  { nombre: 'passwords', archivo: 'e2e/probarPasswords.mjs', args: [SALIDA, RAIZ], app: true },
  { nombre: 'reportes', archivo: 'e2e/probarReportes.mjs', args: [SALIDA, RAIZ], app: true },
  { nombre: 'intentos', archivo: 'e2e/probarIntentos.mjs', args: [SALIDA, RAIZ], app: true },
  { nombre: 's21', archivo: 'e2e/probarS21.mjs', args: [SALIDA, RAIZ], app: true },
  { nombre: 'congregaciones', archivo: 'e2e/probarCongregaciones.mjs', args: [SALIDA], app: true },
  { nombre: 'respaldos', archivo: 'e2e/probarRespaldos.mjs', args: [SALIDA, RAIZ], app: true },
];

const filtro = process.argv.slice(2);
const elegidas = filtro.length ? PRUEBAS.filter((p) => filtro.includes(p.nombre)) : PRUEBAS;

const appArriba = async () => {
  try { return (await fetch('http://localhost:4173/')).ok; } catch { return false; }
};

let preview = null;
if (elegidas.some((p) => p.app) && !(await appArriba())) {
  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('Falta el build: corre primero  npm run build');
    process.exit(1);
  }
  preview = spawn(process.execPath, [path.join(RAIZ, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4173', '--strictPort'], { cwd: RAIZ, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await appArriba()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await appArriba())) { console.error('No arrancó vite preview en el 4173'); preview.kill(); process.exit(1); }
}

const correr = (p) => new Promise((resolve) => {
  const inicio = Date.now();
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'pruebas', p.archivo), ...p.args], { cwd: path.join(RAIZ, 'pruebas', path.dirname(p.archivo)) });
  let texto = '';
  hijo.stdout.on('data', (d) => { texto += d; });
  hijo.stderr.on('data', (d) => { texto += d; });
  const limite = setTimeout(() => { texto += '\n(se pasó de 6 minutos)'; hijo.kill(); }, 6 * 60_000);
  hijo.on('close', (codigo) => {
    clearTimeout(limite);
    fs.writeFileSync(path.join(SALIDA, `${p.nombre}.txt`), texto);
    const okN = (texto.match(/^OK \((\d+)\)/m) || [])[1];
    const fallos = (texto.split(/^FALLOS:?\s*$/m)[1] || '').split(/\n\s*\n/)[0].trim();
    resolve({ ...p, codigo, segundos: Math.round((Date.now() - inicio) / 1000), okN, fallos, texto });
  });
});

const resultados = [];
for (const p of elegidas) {
  process.stdout.write(`▶ ${p.nombre.padEnd(12)} `);
  const r = await correr(p);
  resultados.push(r);
  console.log(r.codigo === 0 ? `✔ ${r.okN ?? ''} ok (${r.segundos}s)` : `✘ FALLÓ (${r.segundos}s)`);
  if (r.codigo !== 0) console.log((r.fallos || r.texto.slice(-1500)).split('\n').map((l) => `    ${l}`).join('\n'));
}
if (preview) preview.kill();

const malas = resultados.filter((r) => r.codigo !== 0);
console.log(`\n${malas.length ? '✘' : '✔'} ${resultados.length - malas.length} de ${resultados.length} pruebas bien. Detalle en pruebas/salida/`);
process.exitCode = malas.length ? 1 : 0;
