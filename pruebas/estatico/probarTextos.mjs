// Todo texto visible con t('…') / tx('…') debe tener su traducción en src/i18n/en.js (CLAUDE.md: idioma ES/EN).
// También revisa que en.js no tenga llaves repetidas.
import fs from 'fs';
import path from 'path';

const RAIZ = process.argv[2];
const ok = [], fallo = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const enTexto = fs.readFileSync(path.join(RAIZ, 'src/i18n/en.js'), 'utf8');
const { default: en } = await import(new URL(`file:///${path.join(RAIZ, 'src/i18n/en.js').replace(/\\/g, '/')}`).href);
const llaves = new Set(Object.keys(en));

// Llaves repetidas (la última gana y la primera se pierde sin aviso)
const vistas = new Map();
const repetidas = [];
for (const m of enTexto.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:/gm)) {
  const k = m[1].replace(/\\'/g, "'");
  if (vistas.has(k)) repetidas.push(k);
  vistas.set(k, true);
}
revisar(repetidas.length === 0, `en.js sin llaves repetidas${repetidas.length ? `: ${repetidas.join(' | ')}` : ''}`);

// Textos de la app sin traducción
const IGNORAR = new Set(['Texto']); // ejemplo en un comentario de i18n/index.jsx
const archivos = [];
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (/\.(js|jsx)$/.test(e.name) && !p.replace(/\\/g, '/').endsWith('i18n/en.js')) archivos.push(p);
  }
};
recorrer(path.join(RAIZ, 'src'));
const faltan = [];
for (const p of archivos) {
  const s = fs.readFileSync(p, 'utf8');
  for (const m of s.matchAll(/\b(?:t|tx)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const k = m[1].replace(/\\'/g, "'");
    if (!llaves.has(k) && !IGNORAR.has(k)) faltan.push(`${path.relative(RAIZ, p)}: ${k}`);
  }
}
revisar(faltan.length === 0, faltan.length ? `textos sin traducir en en.js:\n    ${[...new Set(faltan)].join('\n    ')}` : `todos los textos t('…') tienen traducción (${archivos.length} archivos, ${llaves.size} llaves)`);

console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
