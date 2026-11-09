// Registro de asignación de territorios: quién trabajó cada territorio, cuándo lo tomó, cuándo lo terminó y cuánto
// tardó, en un año de servicio (septiembre–agosto). Sale de territorio_trabajos (grupos, Migración 5).
// Devuelve el modelo de reporte de utils/reportes (Excel, PDF y reporte interactivo). Documento en español.
import { mesesDelAnio, MESES_S21 } from './s21.js';

export const MESES_SIN_TRABAJAR = 4; // "lleva mucho sin trabajarse" (también lo usan los recordatorios)
const DIA = 86400000;
const aFecha = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`) : null);
const dias = (a, b) => (a && b ? Math.max(0, Math.round((aFecha(b) - aFecha(a)) / DIA)) : null);
const hoyTxt = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const etiquetaTerr = (t) => [t?.numero, t?.nombre].filter(Boolean).join(' · ') || `#${t?.id}`;

const COLOR_ESTADO = { Completado: '#059669', 'En progreso': '#D97706', Cancelado: '#64748B', 'Sin trabajar': '#94A3B8' };
const ESTADO = { completado: 'Completado', en_progreso: 'En progreso', cancelado: 'Cancelado' };

/**
 * @param {{ territorios, trabajos, grupos, miembros, anio, usuario, congregacion, hoy? }} p
 *   anio = año de servicio (el que termina: 2026 = sept 2025 – ago 2026)
 */
export function reporteRegistroTerritorios({ territorios, trabajos, grupos, miembros, anio, usuario, congregacion, hoy = hoyTxt() }) {
  const meses = mesesDelAnio(anio);
  const desde = meses[0];
  const hasta = `${anio}-08-31`;
  const enAnio = (f) => !!f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
  const grupoDe = Object.fromEntries((grupos || []).map((g) => [g.id, g.nombre]));
  const nombreDe = Object.fromEntries((miembros || []).map((m) => [m.id, m.nombre]));
  const terrDe = Object.fromEntries((territorios || []).map((t) => [t.id, t]));

  // Historial del año: lo que se tomó o se terminó dentro del año (y lo que sigue en progreso)
  const historial = (trabajos || [])
    .filter((w) => terrDe[w.territorio_id] && (enAnio(w.fecha_inicio) || enAnio(w.fecha_fin) || (w.estado === 'en_progreso' && w.fecha_inicio <= hasta)))
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)))
    .map((w) => ({
      territorio: etiquetaTerr(terrDe[w.territorio_id]),
      grupo: grupoDe[w.grupo_id] || '—',
      inicio: w.fecha_inicio,
      fin: w.estado === 'completado' ? w.fecha_fin : null,
      dias: w.estado === 'completado' ? dias(w.fecha_inicio, w.fecha_fin) : (w.estado === 'en_progreso' ? dias(w.fecha_inicio, hoy) : null),
      estado: ESTADO[w.estado] || w.estado,
      asigno: nombreDe[w.asignado_por] || '',
      termino: nombreDe[w.completado_por] || '',
      notas: w.notas || '',
    }));

  // Una fila por territorio
  const porTerritorio = (territorios || []).map((t) => {
    const suyos = (trabajos || []).filter((w) => w.territorio_id === t.id);
    const completados = suyos.filter((w) => w.estado === 'completado' && w.fecha_fin).sort((a, b) => String(b.fecha_fin).localeCompare(String(a.fecha_fin)));
    const actual = suyos.find((w) => w.estado === 'en_progreso');
    const ultimo = completados[0]?.fecha_fin || null;
    const vueltasAnio = completados.filter((w) => enAnio(w.fecha_fin));
    const duraciones = vueltasAnio.map((w) => dias(w.fecha_inicio, w.fecha_fin)).filter((x) => x != null);
    return {
      territorio: etiquetaTerr(t),
      numero: t.numero || '',
      estado: actual ? 'En progreso' : (ultimo ? 'Completado' : 'Sin trabajar'),
      grupo: actual ? (grupoDe[actual.grupo_id] || '—') : '',
      ultimo,
      sinTrabajar: actual ? 0 : (ultimo ? dias(ultimo, hoy) : null),
      vueltas: vueltasAnio.length,
      promedio: duraciones.length ? Math.round(duraciones.reduce((s, x) => s + x, 0) / duraciones.length) : null,
    };
  }).sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));

  const limite = MESES_SIN_TRABAJAR * 30;
  const olvidados = porTerritorio.filter((r) => r.estado !== 'En progreso' && (r.sinTrabajar == null || r.sinTrabajar > limite));
  const vueltasAnio = historial.filter((h) => h.estado === 'Completado' && enAnio(h.fin));
  const duraciones = vueltasAnio.map((h) => h.dias).filter((x) => x != null);
  const porMes = meses.map((m) => vueltasAnio.filter((h) => h.fin.slice(0, 7) === m.slice(0, 7)).length);
  // Gráfica: solo los que tienen fecha (un "nunca trabajado" en 0 días parecería recién trabajado)
  const masTiempo = [...porTerritorio].filter((r) => r.estado !== 'En progreso' && r.sinTrabajar != null)
    .sort((a, b) => b.sinTrabajar - a.sinTrabajar).slice(0, 15);
  const nunca = porTerritorio.filter((r) => r.estado === 'Sin trabajar').map((r) => r.territorio);

  return {
    archivo: `Registro_Territorios_${anio - 1}-${anio}`,
    titulo: 'Registro de asignación de territorios',
    subtitulo: congregacion || 'Congregación',
    usuario,
    color: '#0891B2',
    meta: [{ etiqueta: 'Año de servicio', valor: `${anio} (sept ${anio - 1} – ago ${anio})` }],
    kpis: [
      { etiqueta: 'Territorios', valor: porTerritorio.length, color: '#2563EB' },
      { etiqueta: 'Terminados en el año', valor: new Set(vueltasAnio.map((h) => h.territorio)).size, detalle: `${vueltasAnio.length} vueltas`, color: '#059669' },
      { etiqueta: 'En progreso', valor: porTerritorio.filter((r) => r.estado === 'En progreso').length, color: '#D97706' },
      { etiqueta: `Más de ${MESES_SIN_TRABAJAR} meses sin trabajar`, valor: olvidados.length, detalle: 'o nunca trabajados', color: '#DC2626' },
      { etiqueta: 'Días por vuelta', valor: duraciones.length ? Math.round(duraciones.reduce((s, x) => s + x, 0) / duraciones.length) : '—', detalle: 'promedio del año', color: '#7C3AED' },
    ],
    secciones: [
      {
        tipo: 'grafica', titulo: 'Territorios terminados por mes', en: ['pdf', 'html'],
        grafica: { tipo: 'barras', etiquetas: MESES_S21.map((m) => m.slice(0, 3)), series: [{ nombre: 'Terminados', valores: porMes, color: '#059669' }] },
      },
      masTiempo.length > 0 && {
        tipo: 'grafica', titulo: 'Los que llevan más tiempo sin trabajarse (días)', en: ['pdf', 'html'],
        descripcion: nunca.length
          ? `Nunca trabajados (no salen en la gráfica): ${nunca.slice(0, 12).join(', ')}${nunca.length > 12 ? ` y ${nunca.length - 12} más` : ''}.`
          : undefined,
        grafica: { tipo: 'barrasH', etiquetas: masTiempo.map((r) => r.territorio), series: [{ nombre: 'Días', valores: masTiempo.map((r) => r.sinTrabajar), color: '#EF4444' }] },
      },
      {
        tipo: 'tabla', titulo: 'Por territorio', hoja: 'Por territorio',
        columnas: [
          { titulo: 'Territorio', clave: 'territorio' },
          { titulo: 'Estado', clave: 'estado', colores: COLOR_ESTADO },
          { titulo: 'Grupo (ahora)', clave: 'grupo' },
          { titulo: 'Última vez terminado', clave: 'ultimo', tipo: 'fecha' },
          { titulo: 'Días sin trabajar', clave: 'sinTrabajar', tipo: 'numero' },
          { titulo: 'Vueltas en el año', clave: 'vueltas', tipo: 'numero' },
          { titulo: 'Días por vuelta', clave: 'promedio', tipo: 'numero' },
        ],
        filas: porTerritorio,
        totales: { vueltas: 'suma' },
      },
      {
        tipo: 'tabla', titulo: 'Historial de asignaciones del año', hoja: 'Historial',
        descripcion: 'Cada vez que un grupo tomó un territorio: cuándo, cuándo lo terminó y cuántos días tardó.',
        columnas: [
          { titulo: 'Territorio', clave: 'territorio' },
          { titulo: 'Grupo', clave: 'grupo' },
          { titulo: 'Asignado', clave: 'inicio', tipo: 'fecha' },
          { titulo: 'Terminado', clave: 'fin', tipo: 'fecha' },
          { titulo: 'Días', clave: 'dias', tipo: 'numero' },
          { titulo: 'Estado', clave: 'estado', colores: COLOR_ESTADO },
          { titulo: 'Asignó', clave: 'asigno', en: ['excel', 'html'] },
          { titulo: 'Terminó', clave: 'termino', en: ['excel', 'html'] },
          { titulo: 'Notas', clave: 'notas', en: ['excel'] },
        ],
        filas: historial,
      },
      olvidados.length > 0 && {
        tipo: 'tabla', titulo: `Más de ${MESES_SIN_TRABAJAR} meses sin trabajarse`, hoja: 'Sin trabajar', color: '#DC2626',
        columnas: [
          { titulo: 'Territorio', clave: 'territorio' },
          { titulo: 'Última vez terminado', clave: 'ultimo', tipo: 'fecha' },
          { titulo: 'Días sin trabajar', clave: 'sinTrabajar', tipo: 'numero' },
        ],
        filas: olvidados.map((r) => ({ ...r, ultimo: r.ultimo || null })),
      },
    ].filter(Boolean),
  };
}
