// Aseo del Salón del Reino por grupos (Migración 17, MIGRACION_17_ASEO.sql).
// Rotación: UN grupo por semana (lunes a domingo) y le tocan todas las reuniones de esa semana.
// La rotación es recurrente: sigue el orden de la planeación semana tras semana hasta que la cambien.
// Un cambio de una semana (otro grupo, "sin aseo" o reuniones en otros días) NO recorre la rotación.
// La misma lógica está copiada en supabase/functions/recordatorios/index.ts (allá no se puede importar esto):
// si cambias una, cambia la otra (la prueba `aseo` compara las dos).

export const VERSICULO = '“Porque Dios no es un Dios de desorden, sino de paz.”';

// ── Fechas como texto 'YYYY-MM-DD' (sin zonas horarias: mediodía UTC) ──
const fechaD = (s) => new Date(`${s}T12:00:00Z`);
const txt = (d) => d.toISOString().slice(0, 10);
export const masDias = (s, n) => { const d = fechaD(s); d.setUTCDate(d.getUTCDate() + n); return txt(d); };
// Lunes de la semana de esa fecha (la semana va de lunes a domingo)
export const lunesDe = (s) => masDias(s, -((fechaD(s).getUTCDay() + 6) % 7));
const semanasEntre = (a, b) => Math.round((fechaD(b) - fechaD(a)) / (7 * 86400000));
// Fecha de un día de la semana (0 = domingo … 6 = sábado) dentro de la semana que empieza ese lunes
export const fechaDelDia = (lunes, dia) => masDias(lunes, (Number(dia) + 6) % 7);

// Reuniones válidas, ordenadas de lunes a domingo: [{ dia: 0-6, hora: 'HH:MM' }]
export const limpiarReuniones = (lista) => (Array.isArray(lista) ? lista : [])
  .filter((r) => r && Number.isInteger(Number(r.dia)) && Number(r.dia) >= 0 && Number(r.dia) <= 6)
  .map((r) => ({ dia: Number(r.dia), hora: /^\d{2}:\d{2}/.test(String(r.hora || '')) ? String(r.hora).slice(0, 5) : '' }))
  .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7));

// Orden de grupos sin los que ya no existen (si borran un grupo, la rotación sigue con los demás)
export const ordenValido = (plan, grupos) => {
  const ids = new Set((grupos || []).map((g) => String(g.id)));
  return (plan?.orden_grupos || []).map(String).filter((id) => ids.has(id));
};

// ¿A quién le toca la semana que empieza ese lunes? → { grupo_id (texto) | null, cambio | null, reuniones: [{fecha, hora}] }
export function semanaAseo(plan, cambios, grupos, lunes) {
  const cambio = (cambios || []).find((c) => String(c.semana).slice(0, 10) === lunes) || null;
  const orden = ordenValido(plan, grupos);
  let grupo_id = null;
  if (cambio) grupo_id = cambio.sin_aseo ? null : (cambio.grupo_id != null ? String(cambio.grupo_id) : null);
  else if (orden.length && plan?.inicio) {
    const n = semanasEntre(lunesDe(String(plan.inicio).slice(0, 10)), lunes);
    grupo_id = orden[((n % orden.length) + orden.length) % orden.length];
  }
  const base = cambio?.reuniones?.length ? cambio.reuniones : plan?.reuniones;
  const reuniones = limpiarReuniones(base).map((r) => ({ fecha: fechaDelDia(lunes, r.dia), hora: r.hora }));
  return { lunes, grupo_id, cambio, reuniones };
}

// Las próximas `semanas` semanas desde la de `hoy`
export const calendarioAseo = (plan, cambios, grupos, hoy, semanas = 10) => {
  const primero = lunesDe(hoy);
  return Array.from({ length: semanas }, (_, i) => semanaAseo(plan, cambios, grupos, masDias(primero, 7 * i)));
};

// Avisos de un día: las reuniones de `fecha` y el grupo que hace el aseo (o null si no hay)
export const aseoDelDia = (plan, cambios, grupos, fecha) => {
  const s = semanaAseo(plan, cambios, grupos, lunesDe(fecha));
  const reunion = s.reuniones.find((r) => r.fecha === fecha);
  return reunion && s.grupo_id ? { grupo_id: s.grupo_id, fecha, hora: reunion.hora, cambio: s.cambio } : null;
};

// '19:30' → '7:30 p. m.'
export const hora12 = (h) => {
  if (!/^\d{2}:\d{2}/.test(String(h || ''))) return '';
  const [hh, mm] = String(h).split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// 'jueves 12 de noviembre'
export const fechaLarga = (s) => { const d = fechaD(s); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };

// Texto del aviso (en español; así se guarda en notificaciones). `cuando` = 'hoy' | 'manana'
export const textoAvisoAseo = ({ grupo, fecha, hora, cuando }) => {
  const dia = `${cuando === 'hoy' ? 'hoy' : 'mañana'} ${fechaLarga(fecha)}`;
  return {
    titulo: `🧹 ${grupo}: aseo del Salón ${cuando === 'hoy' ? 'hoy' : 'mañana'}`,
    mensaje: `${VERSICULO} ¡${grupo}, tienen el increíble privilegio de realizar el aseo del Salón del Reino ${dia}${hora ? ` (reunión de las ${hora12(hora)})` : ''}! Gracias por su amor y su esfuerzo. 💙`,
  };
};
