// Mapas 3D con MapLibre GL (WebGL2) + OpenFreeMap: gratis, sin API key y sin límite de cargas.
// Lo usan en móvil el mapa principal (TerritoriesMap3D) y "Registrar casa" (RegisterHouse3D),
// a través de hooks/useMapa3D.js. El resto de la app (y el escritorio) sigue en Leaflet.
// Este módulo se carga solo con esas pantallas (import dinámico), no pesa en el resto de la app.
//
// En muchas colonias OpenStreetMap casi no tiene edificios dibujados, así que el 3D sale de los
// datos de la app: cada casa es un bloque del color de su estado y lo seleccionado un bloque amarillo.
// Donde OSM sí tiene edificios, también se levantan en 3D.
import * as maplibregl from 'maplibre-gl';
// MapLibre v6 trae su worker en un .mjs aparte; Vite lo copia a /assets y aquí se le dice dónde quedó
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { STATUS_COLORS } from './constants';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };

const OFM = 'https://tiles.openfreemap.org';

// Estilos base. CARTO no (pide API key). El satélite es de Esri World Imagery (requiere atribución).
export const ESTILO_CLARO = `${OFM}/styles/positron`;
export const ESTILO_OSCURO = `${OFM}/styles/dark`;
export const ESTILO_SATELITE = {
  version: 8,
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    satelite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagen © Esri, Maxar, Earthstar Geographics',
    },
    // Misma fuente vectorial que los otros estilos, para los edificios 3D encima del satélite
    openmaptiles: {
      type: 'vector',
      url: `${OFM}/planet`,
      attribution: '© OpenMapTiles © OpenStreetMap',
    },
  },
  layers: [{ id: 'satelite', type: 'raster', source: 'satelite' }],
};

export const estiloPara = (satelite, oscuro) => (satelite ? ESTILO_SATELITE : oscuro ? ESTILO_OSCURO : ESTILO_CLARO);

export const FUENTE_ETIQUETAS = ['Noto Sans Bold'];
export const VACIO = { type: 'FeatureCollection', features: [] };
const AMARILLO = '#FACC15';
const AZUL_RUTA = '#2563EB';

// ── Conversión de datos de la app a GeoJSON ──────────────────────────────────────────────

// La app guarda los polígonos como Leaflet: [[lat, lng], ...]. GeoJSON usa [lng, lat] y anillo cerrado.
export const anilloGeoJSON = (coordenadas) => {
  if (!Array.isArray(coordenadas)) return null;
  // Por si algún polígono viene anidado ([[[lat,lng],...]]), se toma el primer anillo
  const puntos = Array.isArray(coordenadas[0]?.[0]) ? coordenadas[0] : coordenadas;
  const anillo = puntos
    .map(c => [Number(c?.[1]), Number(c?.[0])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (anillo.length < 3) return null;
  const [a, b] = [anillo[0], anillo.at(-1)];
  if (a[0] !== b[0] || a[1] !== b[1]) anillo.push(a);
  return anillo.length >= 4 ? anillo : null;
};

// `extra(item)` agrega propiedades (color por progreso, etiqueta con %, opacidad…)
export const poligonosGeoJSON = (items, colorDefault = '#2563EB', extra) => ({
  type: 'FeatureCollection',
  features: (items || []).flatMap(it => {
    const anillo = anilloGeoJSON(it.coordenadas);
    if (!anillo) return [];
    return [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [anillo] },
      properties: { id: String(it.id), nombre: it.nombre || '', color: it.color || colorDefault, ...(extra ? extra(it) : {}) },
    }];
  }),
});

// Un punto dentro de cada polígono para poner su nombre (uno solo, no uno por mosaico)
export const etiquetasGeoJSON = (poligonos) => ({
  type: 'FeatureCollection',
  features: (poligonos?.features || []).flatMap(f => {
    try {
      const p = turf.pointOnFeature(f);
      p.properties = { ...f.properties };
      return [p];
    } catch { return []; }
  }),
});

// Cuadrado de ~lado metros alrededor de un punto (para levantar casas como bloques 3D)
export const cuadrado = (lng, lat, lado = 7) => {
  const dLat = (lado / 2) / 111320;
  const dLng = (lado / 2) / (111320 * Math.cos(lat * Math.PI / 180));
  return [[
    [lng - dLng, lat - dLat], [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat], [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ]];
};

export const coordsCasa = (c) => {
  const lat = Number(c?.latitud);
  const lng = Number(c?.longitud);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? [lng, lat] : null;
};

const propsCasa = (c) => ({
  id: String(c.id),
  direccion: c.direccion || '',
  estado: c.estado || 'Pendiente',
  color: STATUS_COLORS[c.estado]?.hex || '#9CA3AF',
  offline: !!c._offline,
});

export const casasBloquesGeoJSON = (casas) => ({
  type: 'FeatureCollection',
  features: (casas || []).flatMap(c => {
    const p = coordsCasa(c);
    if (!p) return [];
    return [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: cuadrado(p[0], p[1]) }, properties: propsCasa(c) }];
  }),
});

export const casasPuntosGeoJSON = (casas) => ({
  type: 'FeatureCollection',
  features: (casas || []).flatMap(c => {
    const p = coordsCasa(c);
    if (!p) return [];
    return [{ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: propsCasa(c) }];
  }),
});

// Bloque amarillo de lo seleccionado: el edificio de OSM bajo el pin, una casa, o un cuadrado
export const seleccionGeoJSON = (geometria, altura = 5) => (
  geometria
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geometria, properties: { altura } }] }
    : VACIO
);

// Ruta de visitas: línea + puntos numerados (casas ya ordenadas)
export const rutaGeoJSON = (casasOrdenadas) => {
  const puntos = (casasOrdenadas || []).map(coordsCasa).filter(Boolean);
  return puntos.length > 1
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: puntos }, properties: {} }] }
    : VACIO;
};
export const rutaPuntosGeoJSON = (casasOrdenadas) => ({
  type: 'FeatureCollection',
  features: (casasOrdenadas || []).flatMap((c, i) => {
    const p = coordsCasa(c);
    return p ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { n: String(i + 1) } }] : [];
  }),
});

// ── Capas ───────────────────────────────────────────────────────────────────────────────

// Fuentes GeoJSON propias (ids). 'territorios-etq' se deriva de 'territorios'.
export const FUENTES = ['territorios', 'manzanas', 'casas-bloques', 'casas-puntos', 'seleccion', 'ruta', 'ruta-puntos'];

// Capa antes de la cual va lo nuestro: la que sigue a la ÚLTIMA capa que no es texto.
// (No basta "la primera de texto": el estilo oscuro tiene rellenos después de sus primeros textos
// y se pintaban encima de los techos 3D, que salían negros.)
const primeraCapaDeTexto = (map) => {
  const capas = map.getStyle()?.layers || [];
  let ultima = -1;
  capas.forEach((l, i) => { if (l.type !== 'symbol') ultima = i; });
  return capas[ultima + 1]?.id;
};

const ponerFuente = (map, id, data) => {
  const fuente = map.getSource(id);
  if (fuente) fuente.setData(data);
  else map.addSource(id, { type: 'geojson', data });
};

// Agrega (o vuelve a agregar tras cambiar de estilo) todas las capas propias.
// `datos` = { [idFuente]: GeoJSON } (ver FUENTES); lo que falte queda vacío.
export const agregarCapas = (map, datos = {}, { oscuro = false, satelite = false } = {}) => {
  FUENTES.forEach(id => ponerFuente(map, id, datos[id] || VACIO));
  ponerFuente(map, 'territorios-etq', etiquetasGeoJSON(datos.territorios || VACIO));

  // Lo 3D va debajo de los textos del mapa base (calles, colonias)
  const antes = primeraCapaDeTexto(map);
  const capa = (def, beforeId = antes) => { if (!map.getLayer(def.id)) map.addLayer(def, beforeId); };

  capa({
    id: 'territorios-relleno', type: 'fill', source: 'territorios',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['coalesce', ['get', 'relleno'], satelite ? 0.18 : 0.12] },
  });
  capa({
    id: 'territorios-borde', type: 'line', source: 'territorios',
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 3.5], 'line-opacity': 0.9 },
  });
  capa({
    id: 'manzanas-borde', type: 'line', source: 'manzanas',
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.85 },
  });

  // Edificios de OpenStreetMap en 3D (solo si el estilo tiene la fuente vectorial)
  if (map.getSource('openmaptiles')) {
    capa({
      id: 'edificios-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': oscuro ? '#334155' : '#E2E8F0',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 4]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': satelite ? 0.55 : 0.9,
      },
    });
  }

  // Ruta de visitas (debajo de las casas para que se vean los bloques)
  capa({
    id: 'ruta-linea', type: 'line', source: 'ruta',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': AZUL_RUTA, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 18, 6], 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 },
  });

  // Casas registradas: puntos de lejos, bloques 3D de cerca. Anillo naranja = sin sincronizar.
  capa({
    id: 'casas-punto', type: 'circle', source: 'casas-puntos', maxzoom: 16,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6],
      'circle-stroke-color': ['case', ['get', 'offline'], '#F59E0B', '#FFFFFF'],
      'circle-stroke-width': ['case', ['get', 'offline'], 2.5, 1.5],
    },
  });
  capa({
    id: 'casas-3d', type: 'fill-extrusion', source: 'casas-bloques', minzoom: 15,
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.5, 5],
      'fill-extrusion-opacity': 0.92,
    },
  });
  capa({
    id: 'seleccion-3d', type: 'fill-extrusion', source: 'seleccion',
    paint: {
      'fill-extrusion-color': AMARILLO,
      'fill-extrusion-height': ['+', ['get', 'altura'], 0.6],
      'fill-extrusion-opacity': 0.95,
    },
  });

  // Encima de todo: números de la ruta y nombres de territorio
  // (texto de usuario en capas de símbolos: no es HTML, no hay que escapar)
  capa({
    id: 'ruta-num-fondo', type: 'circle', source: 'ruta-puntos',
    paint: { 'circle-color': AZUL_RUTA, 'circle-radius': 10, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 },
  }, undefined);
  capa({
    id: 'ruta-num', type: 'symbol', source: 'ruta-puntos',
    layout: { 'text-field': ['get', 'n'], 'text-font': FUENTE_ETIQUETAS, 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': '#FFFFFF' },
  }, undefined);
  capa({
    id: 'territorios-nombre', type: 'symbol', source: 'territorios-etq',
    layout: {
      'text-field': ['coalesce', ['get', 'etiqueta'], ['get', 'nombre']],
      'text-font': FUENTE_ETIQUETAS,
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 17, 14],
      'text-line-height': 1.1,
      // Siempre visibles (como en la vista clásica): si chocan con un nombre del mapa base, gana el nuestro
      'text-allow-overlap': true,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': oscuro ? '#0F172A' : '#FFFFFF', 'text-halo-width': 2 },
  }, undefined);
};

// Actualiza los datos sin volver a crear capas
export const actualizarFuente = (map, id, data) => {
  const fuente = map?.getSource?.(id);
  if (fuente) fuente.setData(data);
  if (id === 'territorios') map?.getSource?.('territorios-etq')?.setData(etiquetasGeoJSON(data));
};

// Encuadre de un GeoJSON (para abrir el mapa sobre los territorios o volar a uno)
export const limitesDe = (geojson) => {
  if (!geojson?.features?.length && geojson?.type !== 'Feature') return null;
  try {
    const [minX, minY, maxX, maxY] = turf.bbox(geojson);
    return [[minX, minY], [maxX, maxY]];
  } catch { return null; }
};
