// Preferencias de los mapas 3D (2D/3D, satélite), compartidas por todas las pantallas.
// Archivo aparte y sin MapLibre: lo usa el contexto del mapa, que se carga con la app.
const PREFS_KEY = 'mapa3d_prefs';

export const leerPrefs3D = () => {
  try {
    return { tresD: true, satelite: false, neon: false, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || localStorage.getItem('registro3d_prefs')) || {}) };
  } catch { return { tresD: true, satelite: false, neon: false }; }
};

export const guardarPrefs3D = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* sin storage */ } };
