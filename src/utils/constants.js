export const STATUS_COLORS = {
  "Atendido":             { hex: "#10B981", bg: "rgba(16,185,129,0.7)",  badge: "bg-emerald-50 text-emerald-800" },
  "No atendió":           { hex: "#EF4444", bg: "rgba(239,68,68,0.7)",   badge: "bg-red-50 text-red-800" },
  "Pendiente":            { hex: "#F59E0B", bg: "rgba(245,158,11,0.7)",  badge: "bg-amber-50 text-amber-800" },
  "No tocar":             { hex: "#1F2937", bg: "rgba(31,41,55,0.7)",    badge: "bg-gray-100 text-gray-800" },
  "Solo fines de semana": { hex: "#3B82F6", bg: "rgba(59,130,246,0.7)",  badge: "bg-blue-50 text-blue-800" },
};

export const STATUS_OPTIONS = Object.keys(STATUS_COLORS);

export const ROLES = [
  { value: 'Publicador',       label: 'Publicador (Solo registrar casas)' },
  { value: 'Ministerial',      label: 'Ministerial (Acceso Operativo)' },
  { value: 'Anciano',          label: 'Anciano (Acceso Operativo)' },
  { value: 'Admin Principal',  label: 'Admin Principal (Acceso Total)' },
];

export const getStatusColor = (estado) => STATUS_COLORS[estado]?.hex || '#9CA3AF';
export const getStatusBadge = (estado) => STATUS_COLORS[estado]?.badge || 'bg-gray-100 text-gray-700';
