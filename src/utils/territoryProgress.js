// Progreso de territorios según el trabajo de los grupos de predicación (territorio_trabajos).
//
//  - En progreso:  un grupo lo tiene asignado ahora. % = casas visitadas DESDE que lo tomó.
//  - Completado:   el último trabajo se marcó terminado (con fecha).
//  - Sin trabajar: ningún grupo lo ha trabajado.
//
// Si la Migración 5 aún no existe (gruposDisponibles = false) se usa solo el estado de las
// casas: 0% sin trabajar, 100% completado, intermedio en progreso.
// Casa "visitada" = cualquier estado distinto de "Pendiente".

import { t, getLocale } from '../i18n';

// Las etiquetas se guardan en español; se traducen al mostrarlas con t(cfg.label)
export const PROGRESO = {
  completado:   { label: 'Completado',   color: '#10B981' },
  en_progreso:  { label: 'En progreso',  color: '#F59E0B' },
  sin_trabajar: { label: 'Sin trabajar', color: '#94A3B8' },
};

const DIA = 24 * 60 * 60 * 1000;

const parseFecha = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`) : null);

export const formatFechaCorta = (f) =>
  parseFecha(f)?.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }) ?? '';

export const haceCuanto = (f) => {
  const d = parseFecha(f);
  if (!d) return '';
  const dias = Math.max(0, Math.floor((Date.now() - d.getTime()) / DIA));
  if (dias === 0) return t('hoy');
  if (dias === 1) return t('ayer');
  if (dias < 30) return t('hace {n} días', { n: dias });
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? t('hace 1 mes') : t('hace {n} meses', { n: meses });
  const anios = Math.floor(meses / 12);
  return anios === 1 ? t('hace 1 año') : t('hace {n} años', { n: anios });
};

const visitada = (c) => c.estado && c.estado !== 'Pendiente';

// Índice casa_id → fecha (ISO) de la última visita registrada en historial (estado ≠ Pendiente)
export const indexarHistorial = (historial = []) => {
  const idx = {};
  historial.forEach(h => {
    if (!h.estado_nuevo || h.estado_nuevo === 'Pendiente') return;
    const k = String(h.casa_id);
    if (!idx[k] || h.created_at > idx[k]) idx[k] = h.created_at;
  });
  return idx;
};

/**
 * @param territorio
 * @param casas        todas las casas (se filtran por territorio)
 * @param ctx          { disponible, trabajos, grupos, historialIdx }
 */
export const getTerritoryProgress = (territorio, casas, ctx = {}) => {
  const { disponible = false, trabajos = [], grupos = [], historialIdx = {} } = ctx;
  const id = String(territorio.id);
  const casasT = casas.filter(c => String(c.territorio_id) === id);
  const total = casasT.length;
  const pctDe = (n) => (total ? Math.round((n / total) * 100) : 0);

  // Sin migración: solo por casas
  if (!disponible) {
    const v = casasT.filter(visitada).length;
    const pct = pctDe(v);
    const estado = pct === 0 ? 'sin_trabajar' : pct === 100 ? 'completado' : 'en_progreso';
    return { estado, detalle: t('Por casas visitadas'), fecha: null, total, visitadas: v, pct, grupo: null, trabajo: null };
  }

  const trabajosT = trabajos
    .filter(tr => String(tr.territorio_id) === id && tr.estado !== 'cancelado')
    .sort((a, b) => String(b.fecha_inicio || b.created_at).localeCompare(String(a.fecha_inicio || a.created_at)));
  const grupoDe = (tr) => grupos.find(g => String(g.id) === String(tr?.grupo_id)) || null;

  const activo = trabajosT.find(tr => tr.estado === 'en_progreso');
  if (activo) {
    const desde = String(activo.fecha_inicio || activo.created_at).slice(0, 10);
    // Visitada en este ciclo: registrada desde el inicio o con visita en historial desde el inicio
    const v = casasT.filter(c => visitada(c) && (
      String(c.created_at || '').slice(0, 10) >= desde
      || String(historialIdx[String(c.id)] || '').slice(0, 10) >= desde
    )).length;
    const grupo = grupoDe(activo);
    return {
      estado: 'en_progreso',
      detalle: t('{grupo} · desde {fecha}', { grupo: grupo?.nombre || t('Grupo'), fecha: formatFechaCorta(desde) }),
      fecha: desde, total, visitadas: v, pct: pctDe(v), grupo, trabajo: activo,
    };
  }

  const ultimo = trabajosT.find(tr => tr.estado === 'completado');
  if (ultimo) {
    const grupo = grupoDe(ultimo);
    return {
      estado: 'completado',
      detalle: t('{grupo} · terminado {fecha} ({hace})', { grupo: grupo?.nombre || t('Grupo'), fecha: formatFechaCorta(ultimo.fecha_fin), hace: haceCuanto(ultimo.fecha_fin) }),
      fecha: ultimo.fecha_fin, total, visitadas: total, pct: 100, grupo, trabajo: ultimo,
    };
  }

  return { estado: 'sin_trabajar', detalle: t('Nunca trabajado'), fecha: null, total, visitadas: 0, pct: 0, grupo: null, trabajo: null };
};

// Resumen por grupo de predicación (dashboard y PDF).
// progreso: { [territorioId]: resultado de getTerritoryProgress }
export const resumenPorGrupo = ({ grupos = [], trabajos = [], miembros = [], territorios = [], progreso = {} }) => {
  const anio = String(new Date().getFullYear());
  return grupos.map(g => {
    const delGrupo = trabajos.filter(tr => String(tr.grupo_id) === String(g.id));
    const enProgreso = delGrupo
      .filter(tr => tr.estado === 'en_progreso')
      .map(tr => territorios.find(x => String(x.id) === String(tr.territorio_id)))
      .filter(Boolean);
    const terminados = delGrupo.filter(tr => tr.estado === 'completado');
    return {
      grupo: g,
      publicadores: miembros.filter(m => String(m.grupo_id) === String(g.id)).length,
      enProgreso,
      // Avance promedio de los territorios que trabaja ahora
      avance: enProgreso.length
        ? Math.round(enProgreso.reduce((s, x) => s + (progreso[x.id]?.pct || 0), 0) / enProgreso.length)
        : 0,
      terminadosAnio: terminados.filter(tr => String(tr.fecha_fin || '').startsWith(anio)).length,
      ultimoTerminado: terminados.map(tr => tr.fecha_fin).filter(Boolean).sort().at(-1) || null,
    };
  });
};

// Conteo de territorios por estado de progreso
export const conteoPorEstado = (progreso = {}) => {
  const c = { completado: 0, en_progreso: 0, sin_trabajar: 0 };
  Object.values(progreso).forEach(p => { if (p && c[p.estado] !== undefined) c[p.estado] += 1; });
  return c;
};
