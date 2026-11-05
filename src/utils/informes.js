// Informes de servicio (Migración 7): constantes y fechas.
// Los valores se guardan en español en la BD y solo se traducen al mostrarlos (t(valor)).

export const TIPOS_PUBLICADOR = ['Publicador', 'Precursor auxiliar', 'Precursor regular'];
export const esPrecursor = (tipo) => tipo === 'Precursor auxiliar' || tipo === 'Precursor regular';

// Metas sugeridas cuando la persona aún no define la suya (horas)
export const METAS_SUGERIDAS = {
  'Precursor regular': { mensual: 50, anual: 600 },
  'Precursor auxiliar': { mensual: 30, anual: null },
};

// Tipos de salida que suman horas de predicación (el servicio sagrado va aparte)
export const TIPOS_SALIDA = [
  { valor: 'casa_en_casa', etiqueta: 'Casa en casa' },
  { valor: 'cartas', etiqueta: 'Cartas' },
  { valor: 'telefono', etiqueta: 'Teléfono' },
  { valor: 'exhibidor', etiqueta: 'Exhibidor' },
  { valor: 'informal', etiqueta: 'Informal' },
];
export const etiquetaTipoSalida = (valor) => TIPOS_SALIDA.find(x => x.valor === valor)?.etiqueta || 'Otro';

export const ROLES_VEN_INFORMES = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

// ── Fechas (siempre en hora local; 'YYYY-MM-DD') ──
const dos = (n) => String(n).padStart(2, '0');
const aTexto = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deTexto = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };

export const hoyLocal = () => aTexto(new Date());
export const mesDe = (fecha) => `${fecha.slice(0, 7)}-01`;
export const mesActual = () => mesDe(hoyLocal());
export const sumarMeses = (mes, n) => { const d = deTexto(mes); return aTexto(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
export const finDeMes = (mes) => { const d = deTexto(mes); return aTexto(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

export const nombreMes = (mes, locale = 'es-MX') => {
  const s = deTexto(mes).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Año de servicio: 1 de septiembre al 31 de agosto
export const anioServicio = (mes) => {
  const d = deTexto(mes);
  const inicio = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return { desde: `${inicio}-09-01`, hasta: `${inicio + 1}-08-31`, etiqueta: `${inicio}–${inicio + 1}` };
};

// Días que quedan del mes contando hoy (0 si el mes ya pasó)
export const diasRestantes = (mes) => {
  const hoy = hoyLocal();
  if (mesDe(hoy) !== mes) return mes > hoy ? Number(finDeMes(mes).slice(8)) : 0;
  return Number(finDeMes(mes).slice(8)) - Number(hoy.slice(8)) + 1;
};

// 12.5 → "12 h 30 min"
export const formatHoras = (h) => {
  const total = Math.round((Number(h) || 0) * 60);
  const horas = Math.floor(total / 60);
  const min = total % 60;
  if (!min) return `${horas} h`;
  return horas ? `${horas} h ${min} min` : `${min} min`;
};

export const totalesDe = (registros) => registros.reduce((acc, r) => {
  const horas = Number(r.horas) || 0;
  if (r.categoria === 'servicio_sagrado') acc.servicioSagrado += horas;
  else { acc.horas += horas; acc.revisitas += Number(r.revisitas) || 0; }
  return acc;
}, { horas: 0, revisitas: 0, servicioSagrado: 0 });
