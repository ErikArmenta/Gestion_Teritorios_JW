// Reportes (Excel, PDF y reporte interactivo) con la marca de la app. Todo en español (son documentos).
//
// MODELO DE REPORTE (lo arma cada pantalla y lo reciben exportarExcel / exportarPDF / exportarInteractivo):
// {
//   archivo: 'Reporte_Territorial_2026-11-06',      // nombre sin extensión
//   titulo: 'Reporte de cobertura territorial',
//   subtitulo: 'Congregación Centro',
//   meta: [{ etiqueta: 'Período', valor: 'Todos los datos' }, …],   // + "Generado" y "Por" automáticos
//   color: '#2563EB',                                 // color de acento (opcional)
//   kpis: [{ etiqueta, valor, detalle?, color? }],
//   secciones: [
//     { tipo: 'texto', titulo, parrafos: ['…'] },
//     { tipo: 'grafica', titulo, grafica: { tipo: 'dona'|'barras'|'barrasH'|'lineas', etiquetas: [],
//         series: [{ nombre, valores: [], color }], apiladas?, unidad? } },
//     { tipo: 'tabla', titulo, hoja?, descripcion?, columnas: [{ titulo, clave, tipo?, ancho?, colores? }],
//         filas: [{…}], totales?: { clave: 'suma' | valor } },
//   ]  // cada sección puede llevar en: ['excel','pdf','html'] (por defecto en todos)
// }
// Tipos de columna: texto | numero | decimal | horas | porcentaje (0.25 = 25 %) | fecha | fechaHora | siNo

export const MARCA = {
  app: 'Gestión Territorial',
  autor: 'Master Engenering EA',
  azul: '#2563EB',
  tinta: '#0F172A',
  pizarra: '#1E293B',
  gris: '#64748B',
  grisClaro: '#94A3B8',
  borde: '#E2E8F0',
  fondo: '#F8FAFC',
};

// Secciones y columnas pueden llevar en: ['excel','pdf','html'] (por defecto, en todos)
export const enDestino = (x, destino) => !x.en || x.en.includes(destino);

export const hexARgb = (hex) => {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Mezcla con blanco (0 = color, 1 = blanco) → fondos suaves para chips
export const aclarar = (hex, k = 0.85) => {
  const [r, g, b] = hexARgb(hex);
  const m = (c) => Math.round(c + (255 - c) * k);
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

export const fechaGenerado = () => new Date().toLocaleString('es-MX', {
  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Texto seguro para HTML/SVG (nombres, notas y direcciones los escribe la gente)
export const escapar = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const nombreSeguro = (s) => String(s || 'reporte')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Valores ──
const aFecha = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const horasTexto = (h) => {
  const total = Math.round((Number(h) || 0) * 60);
  const horas = Math.floor(total / 60);
  const min = total % 60;
  if (!min) return `${horas} h`;
  return horas ? `${horas} h ${min} min` : `${min} min`;
};

// Para PDF y reporte interactivo (Excel usa el valor crudo con formato de número)
export function textoCelda(valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (tipo) {
    case 'numero': return Number(valor).toLocaleString('es-MX');
    case 'decimal': return Number(valor).toLocaleString('es-MX', { maximumFractionDigits: 2 });
    case 'horas': return horasTexto(valor);
    case 'porcentaje': return `${(Number(valor) * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
    case 'fecha': { const d = aFecha(valor); return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : String(valor); }
    case 'fechaHora': { const d = aFecha(valor); return d ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : String(valor); }
    case 'siNo': return valor ? 'Sí' : 'No';
    default: return String(valor);
  }
}
export { aFecha };
export const esNumerica = (tipo) => ['numero', 'decimal', 'horas', 'porcentaje'].includes(tipo);

// Fila de totales: 'suma' suma la columna; cualquier otro valor se pone tal cual
export function calcularTotales(seccion) {
  if (!seccion.totales) return null;
  const fila = {};
  seccion.columnas.forEach((c, i) => {
    const t = seccion.totales[c.clave];
    if (t === 'suma') fila[c.clave] = seccion.filas.reduce((s, f) => s + (Number(f[c.clave]) || 0), 0);
    else if (t !== undefined) fila[c.clave] = t;
    else if (i === 0) fila[c.clave] = 'Total';
  });
  return fila;
}

// ── Logo (el de la app) ──
// /JW.jpg es rectangular (1200×630) con el ícono morado al centro sobre fondo gris claro: se recorta solo el
// ícono (detectando dónde deja de ser fondo), queda cuadrado y las esquinas redondas transparentes.
let logoPromesa = null;
function recortarLogo(img, lado = 256) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  const fondo = [data[0], data[1], data[2]]; // color de la esquina
  const dif = (i) => Math.abs(data[i] - fondo[0]) + Math.abs(data[i + 1] - fondo[1]) + Math.abs(data[i + 2] - fondo[2]);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (dif((y * width + x) * 4) > 60) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  // Cuadrado centrado en el ícono
  const tam = Math.max(x1 - x0, y1 - y0) + 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sal = document.createElement('canvas');
  sal.width = lado; sal.height = lado;
  const s = sal.getContext('2d', { willReadFrequently: true });
  s.imageSmoothingQuality = 'high';
  s.drawImage(c, cx - tam / 2, cy - tam / 2, tam, tam, 0, 0, lado, lado);
  // Fondo → transparente, SOLO el que toca el borde (relleno desde afuera): las letras blancas de adentro
  // se parecen al fondo pero quedan rodeadas de morado y no se tocan. Borde suave en las esquinas redondas.
  const out = s.getImageData(0, 0, lado, lado);
  const d = out.data;
  const v = (p) => Math.abs(d[p * 4] - fondo[0]) + Math.abs(d[p * 4 + 1] - fondo[1]) + Math.abs(d[p * 4 + 2] - fondo[2]);
  const visto = new Uint8Array(lado * lado);
  const pila = [];
  for (let i = 0; i < lado; i++) pila.push(i, (lado - 1) * lado + i, i * lado, i * lado + lado - 1);
  while (pila.length) {
    const p = pila.pop();
    if (visto[p]) continue;
    visto[p] = 1;
    const dv = v(p);
    if (dv >= 90) continue; // ya es el ícono
    d[p * 4 + 3] = dv < 24 ? 0 : Math.round((255 * (dv - 24)) / 66);
    if (dv >= 24) continue; // orilla suave: no seguir hacia adentro
    const x = p % lado, y = (p - x) / lado;
    if (x > 0) pila.push(p - 1);
    if (x < lado - 1) pila.push(p + 1);
    if (y > 0) pila.push(p - lado);
    if (y < lado - 1) pila.push(p + lado);
  }
  s.putImageData(out, 0, 0);
  return sal.toDataURL('image/png');
}
export function logoPNG() {
  if (!logoPromesa) {
    logoPromesa = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try { resolve(recortarLogo(img)); } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = '/JW.jpg';
    });
  }
  return logoPromesa;
}

// reporte.usuario (opcional) = nombre de quien lo genera
export const metaCompleta = (reporte) => [
  ...(reporte.meta || []),
  { etiqueta: 'Generado', valor: fechaGenerado() },
  ...(reporte.usuario ? [{ etiqueta: 'Por', valor: reporte.usuario }] : []),
];
