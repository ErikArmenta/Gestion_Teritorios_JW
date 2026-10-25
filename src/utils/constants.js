export const STATUS_COLORS = {
  "Atendido":             { hex: "#10B981", bg: "rgba(16,185,129,0.7)",  badge: "bg-emerald-50 text-emerald-800" },
  "No atendió":           { hex: "#EF4444", bg: "rgba(239,68,68,0.7)",   badge: "bg-red-50 text-red-800" },
  "Pendiente":            { hex: "#F59E0B", bg: "rgba(245,158,11,0.7)",  badge: "bg-amber-50 text-amber-800" },
  "No tocar":             { hex: "#1F2937", bg: "rgba(31,41,55,0.7)",    badge: "bg-gray-100 text-gray-800" },
  "Solo fines de semana": { hex: "#3B82F6", bg: "rgba(59,130,246,0.7)",  badge: "bg-blue-50 text-blue-800" },
};

export const STATUS_OPTIONS = Object.keys(STATUS_COLORS);

export const ROLES = [
  { value: 'Super Admin',      label: 'Super Admin (Gestión Global)' },
  { value: 'Admin Principal',  label: 'Admin Principal (Acceso Total)' },
  { value: 'Anciano',          label: 'Anciano (Acceso Operativo)' },
  { value: 'Ministerial',      label: 'Ministerial (Acceso Operativo)' },
  { value: 'Publicador',       label: 'Publicador (Solo registrar casas)' },
];

export const getStatusColor = (estado) => STATUS_COLORS[estado]?.hex || '#9CA3AF';
export const getStatusBadge = (estado) => STATUS_COLORS[estado]?.badge || 'bg-gray-100 text-gray-700';

// Mapa base. CARTO (basemaps.cartocdn.com) ahora exige API key y muestra "API KEY REQUIRED",
// así que se usa OpenStreetMap; la clase "dark-tiles" lo oscurece por CSS (index.css).
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const DARK_MAP_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTRIBUTION,
  className: 'dark-tiles',
  maxZoom: 19,
};
export const LIGHT_MAP_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTRIBUTION,
  maxZoom: 19,
};

// Icono de exhibidor (mismo dibujo que components/ExhibidorIcon.jsx) para marcadores L.divIcon
export const EXHIBIDOR_ICON_SVG_PATHS =
  '<rect x="6" y="2" width="12" height="18" rx="1.5"/>' +
  '<path d="M9 5.5h6"/><path d="M6 9h12"/><path d="M6 13.5h12"/>' +
  '<path d="M9 11.25h2M13 11.25h2"/><path d="M9 15.75h2M13 15.75h2"/>' +
  '<path d="M8.5 20v2M15.5 20v2"/>';
