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

// ── Logo (el de la app, reducido para no inflar los archivos) ──
let logoPromesa = null;
export function logoPNG() {
  if (!logoPromesa) {
    logoPromesa = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const lado = 192;
          const c = document.createElement('canvas');
          c.width = lado; c.height = lado;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, lado, lado);
          resolve(c.toDataURL('image/png'));
        } catch { resolve(null); }
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
