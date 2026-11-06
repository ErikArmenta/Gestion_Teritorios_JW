// Carga el código REAL de una Edge Function (supabase/functions/<x>/index.ts) en Node con Deno simulado.
// Cada llamada crea una instancia nueva del módulo (cachés limpias) y lee el entorno de `entorno`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const entorno = {};
globalThis.Deno = { env: { get: (k) => entorno[k] }, serve: () => {} };

export async function cargarFuncion(rutaIndex, extra = {}) {
  Object.assign(entorno, extra);
  const src = fs.readFileSync(rutaIndex, 'utf8')
    .replace("'npm:@supabase/supabase-js@2'", "'./mockSupabase.mjs'")
    .replace("'npm:@simplewebauthn/server@13.3.3'", "'@simplewebauthn/server'")
    .replace("'npm:jose@5.10.0'", "'jose'");
  if (src.includes("'npm:")) throw new Error('quedó un import npm: sin reemplazar');
  const nombre = path.basename(path.dirname(rutaIndex));
  const destino = path.join(aqui, `fn-${nombre}.mts`);
  fs.writeFileSync(destino, src);
  let handler;
  globalThis.Deno.serve = (h) => { handler = h; };
  await import(pathToFileURL(destino).href + `?v=${Date.now()}${Math.random()}`);
  const { db } = await import('./mockSupabase.mjs');
  return { handler, db };
}
