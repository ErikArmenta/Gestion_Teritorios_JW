// Gráficas en SVG (sin librerías): las usa el reporte interactivo (con tooltips) y el PDF (pasadas a PNG).
// grafica: { tipo: 'dona'|'barras'|'barrasH'|'lineas', etiquetas: [], series: [{ nombre, valores, color }], apiladas?, unidad? }
import { escapar } from './comun';

const PALETA_CLARA = { texto: '#0F172A', suave: '#64748B', rejilla: '#E2E8F0', fondo: '#FFFFFF' };
// En el reporte interactivo los colores de texto salen de variables CSS (modo claro/oscuro)
export const PALETA_CSS = { texto: 'var(--t1)', suave: 'var(--t2)', rejilla: 'var(--rej)', fondo: 'var(--card)' };

const COLORES = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16', '#64748B'];
const colorSerie = (s, i) => s.color || COLORES[i % COLORES.length];
const fmt = (v) => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
const corto = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const tip = (txt) => ` data-tip="${escapar(txt)}"`;

// Escala "bonita" para el eje Y
function escala(max) {
  if (max <= 0) return { tope: 1, paso: 1 };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || bruto;
  const pasoFinal = max < 5 ? 1 : paso;
  return { tope: Math.ceil(max / pasoFinal) * pasoFinal, paso: pasoFinal };
}

function leyendaSVG(series, ancho, p) {
  let x = 0;
  const items = series.map((s, i) => {
    const w = 26 + String(s.nombre).length * 7.2;
    const g = `<g transform="translate(${x},0)"><rect width="12" height="12" rx="3" fill="${colorSerie(s, i)}"/><text x="18" y="10.5" font-size="12" fill="${p.suave}">${escapar(s.nombre)}</text></g>`;
    x += w + 14;
    return g;
  });
  return `<g transform="translate(${Math.max(0, (ancho - x) / 2)},6)">${items.join('')}</g>`;
}

function dona(g, p, { leyenda }) {
  // Sin leyenda (reporte interactivo: va en HTML abajo) el lienzo es solo la dona: en el celular no se encoge
  const W = leyenda ? 800 : 340, H = 340;
  const valores = g.series[0]?.valores || [];
  const total = valores.reduce((s, v) => s + (Number(v) || 0), 0);
  const cx = leyenda ? 250 : 170, cy = 170, R = 140, r = 88;
  let ang = -Math.PI / 2;
  const colores = g.etiquetas.map((_, i) => g.colores?.[i] || COLORES[i % COLORES.length]);
  const partes = valores.map((v, i) => {
    const val = Number(v) || 0;
    if (!val || !total) return '';
    const frac = val / total;
    const etiqueta = `${g.etiquetas[i]}: ${fmt(val)} (${fmt(frac * 100)} %)`;
    if (frac >= 0.9999) {
      return `<g class="pt"${tip(etiqueta)}><circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${colores[i]}" stroke-width="${R - r}"/></g>`;
    }
    const a1 = ang, a2 = ang + frac * Math.PI * 2;
    ang = a2;
    const grande = a2 - a1 > Math.PI ? 1 : 0;
    const P = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const d = `M ${P(R, a1)} A ${R} ${R} 0 ${grande} 1 ${P(R, a2)} L ${P(r, a2)} A ${r} ${r} 0 ${grande} 0 ${P(r, a1)} Z`;
    return `<g class="pt"${tip(etiqueta)}><path d="${d}" fill="${colores[i]}" stroke="${p.fondo}" stroke-width="2"/></g>`;
  }).join('');
  const centro = `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="34" font-weight="800" fill="${p.texto}">${fmt(total)}</text>`
    + `<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="13" fill="${p.suave}">${escapar(g.unidad || 'total')}</text>`;
  const ley = leyenda ? g.etiquetas.map((e, i) => {
    const v = Number(valores[i]) || 0;
    const y = 70 + i * 30;
    return `<g><rect x="460" y="${y - 11}" width="14" height="14" rx="4" fill="${colores[i]}"/>`
      + `<text x="484" y="${y}" font-size="14" fill="${p.texto}">${escapar(corto(e, 24))}</text>`
      + `<text x="780" y="${y}" font-size="14" font-weight="700" text-anchor="end" fill="${p.texto}">${fmt(v)}${total ? ` · ${fmt((v / total) * 100)} %` : ''}</text></g>`;
  }).join('') : '';
  return { W, H, cuerpo: partes + centro + ley, colores };
}

function barras(g, p, { leyenda }) {
  const W = 800, H = 360;
  const top = leyenda && g.series.length > 1 ? 40 : 18, izq = 46, der = 12;
  const n = g.etiquetas.length || 1;
  const rotar = n > 7;
  const abajo = rotar ? 86 : 40;
  const altoUtil = H - top - abajo;
  const anchoUtil = W - izq - der;
  const totales = g.etiquetas.map((_, i) => g.series.reduce((s, se) => s + (Number(se.valores[i]) || 0), 0));
  const max = g.apiladas ? Math.max(0, ...totales) : Math.max(0, ...g.series.flatMap((s) => s.valores.map((v) => Number(v) || 0)));
  const { tope, paso } = escala(max);
  const y = (v) => top + altoUtil - (v / tope) * altoUtil;
  let ejes = '';
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    ejes += `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="${p.rejilla}" stroke-width="1"/>`
      + `<text x="${izq - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${p.suave}">${fmt(v)}</text>`;
  }
  const grupo = anchoUtil / n;
  const anchoBarra = g.apiladas ? Math.min(56, grupo * 0.6) : Math.min(34, (grupo * 0.72) / g.series.length);
  let cuerpo = '';
  g.etiquetas.forEach((e, i) => {
    const x0 = izq + grupo * i + grupo / 2;
    let acumulado = 0;
    g.series.forEach((s, j) => {
      const v = Number(s.valores[i]) || 0;
      const color = colorSerie(s, j);
      const txt = `${e} · ${s.nombre}: ${fmt(v)}`;
      if (g.apiladas) {
        if (!v) return;
        const y1 = y(acumulado + v), y0 = y(acumulado);
        acumulado += v;
        cuerpo += `<g class="pt"${tip(txt)}><rect x="${x0 - anchoBarra / 2}" y="${y1}" width="${anchoBarra}" height="${Math.max(0, y0 - y1)}" fill="${color}" rx="3"/></g>`;
      } else {
        const x = x0 - (anchoBarra * g.series.length) / 2 + anchoBarra * j;
        const h = Math.max(0, y(0) - y(v));
        cuerpo += `<g class="pt"${tip(txt)}><rect x="${x + 1}" y="${y(v)}" width="${Math.max(2, anchoBarra - 2)}" height="${h}" fill="${color}" rx="4"/></g>`;
      }
    });
    if (g.apiladas && totales[i]) cuerpo += `<text x="${x0}" y="${y(totales[i]) - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="${p.texto}">${fmt(totales[i])}</text>`;
    const ty = H - abajo + 18;
    cuerpo += rotar
      ? `<text transform="translate(${x0},${ty}) rotate(-38)" font-size="11" text-anchor="end" fill="${p.suave}">${escapar(corto(e, 16))}</text>`
      : `<text x="${x0}" y="${ty}" font-size="11" text-anchor="middle" fill="${p.suave}">${escapar(corto(e, Math.max(6, Math.floor(grupo / 7))))}</text>`;
  });
  const ley = leyenda && g.series.length > 1 ? leyendaSVG(g.series, W, p) : '';
  return { W, H, cuerpo: ejes + cuerpo + ley };
}

function barrasH(g, p) {
  const W = 800, fila = 34, top = 10;
  const n = g.etiquetas.length;
  const H = top * 2 + Math.max(1, n) * fila;
  const izq = 200, der = 70;
  const valores = g.series[0]?.valores || [];
  const max = Math.max(1, ...valores.map((v) => Number(v) || 0));
  const color = colorSerie(g.series[0] || {}, 0);
  const cuerpo = g.etiquetas.map((e, i) => {
    const v = Number(valores[i]) || 0;
    const y = top + i * fila;
    const w = ((W - izq - der) * v) / max;
    return `<g class="pt"${tip(`${e}: ${fmt(v)}`)}>`
      + `<text x="${izq - 10}" y="${y + 21}" font-size="13" text-anchor="end" fill="${p.texto}">${escapar(corto(e, 26))}</text>`
      + `<rect x="${izq}" y="${y + 7}" width="${W - izq - der}" height="20" rx="6" fill="${p.rejilla}" opacity="0.6"/>`
      + `<rect x="${izq}" y="${y + 7}" width="${Math.max(v ? 4 : 0, w)}" height="20" rx="6" fill="${g.colores?.[i] || color}"/>`
      + `<text x="${izq + Math.max(v ? 4 : 0, w) + 8}" y="${y + 22}" font-size="13" font-weight="700" fill="${p.texto}">${fmt(v)}</text></g>`;
  }).join('');
  return { W, H, cuerpo };
}

function lineas(g, p, { leyenda }) {
  const W = 800, H = 320;
  const top = leyenda && g.series.length > 1 ? 40 : 22, izq = 46, der = 24, abajo = 40;
  const n = Math.max(1, g.etiquetas.length);
  const max = Math.max(0, ...g.series.flatMap((s) => s.valores.map((v) => Number(v) || 0)));
  const { tope, paso } = escala(max);
  const altoUtil = H - top - abajo;
  const x = (i) => izq + (n === 1 ? (W - izq - der) / 2 : ((W - izq - der) * i) / (n - 1));
  const y = (v) => top + altoUtil - (v / tope) * altoUtil;
  let cuerpo = '';
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    cuerpo += `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="${p.rejilla}"/>`
      + `<text x="${izq - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${p.suave}">${fmt(v)}</text>`;
  }
  g.etiquetas.forEach((e, i) => {
    cuerpo += `<text x="${x(i)}" y="${H - abajo + 20}" font-size="11" text-anchor="middle" fill="${p.suave}">${escapar(corto(e, 12))}</text>`;
  });
  g.series.forEach((s, j) => {
    const color = colorSerie(s, j);
    const pts = s.valores.map((v, i) => [x(i), y(Number(v) || 0)]);
    if (!pts.length) return;
    const linea = pts.map(([a, b], i) => `${i ? 'L' : 'M'} ${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
    cuerpo += `<path d="${linea} L ${pts[pts.length - 1][0]} ${y(0)} L ${pts[0][0]} ${y(0)} Z" fill="${color}" opacity="0.12"/>`
      + `<path d="${linea}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(([a, b], i) => {
      cuerpo += `<g class="pt"${tip(`${g.etiquetas[i]} · ${s.nombre}: ${fmt(s.valores[i])}`)}><circle cx="${a}" cy="${b}" r="5.5" fill="${color}" stroke="${p.fondo}" stroke-width="2"/></g>`;
    });
  });
  if (leyenda && g.series.length > 1) cuerpo += leyendaSVG(g.series, W, p);
  return { W, H, cuerpo };
}

const TIPOS = { dona, barras, barrasH, lineas };

// SVG completo. paleta: PALETA_CSS (reporte interactivo) o clara (PDF). leyenda: dibujarla dentro del SVG.
export function graficaSVG(g, { paleta = PALETA_CLARA, leyenda = true } = {}) {
  const fn = TIPOS[g.tipo] || barras;
  const { W, H, cuerpo } = fn(g, paleta, { leyenda });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" role="img">${cuerpo}</svg>`;
}

export const coloresDona = (g) => g.etiquetas.map((_, i) => g.colores?.[i] || COLORES[i % COLORES.length]);
export const colorDeSerie = colorSerie;

// SVG → PNG (para el PDF). Devuelve { url, ancho, alto } o null.
export async function graficaPNG(g, escalaPx = 2) {
  const svg = graficaSVG(g, { paleta: PALETA_CLARA, leyenda: true });
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const W = Number(m?.[1] || 800), H = Number(m?.[2] || 360);
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = W * escalaPx; c.height = H * escalaPx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/png'), ancho: W, alto: H };
  } catch {
    return null;
  }
}
