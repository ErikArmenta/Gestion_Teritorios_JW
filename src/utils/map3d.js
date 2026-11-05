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
import { STATUS_COLORS, EXHIBIDOR_ICON_SVG_PATHS } from './constants';
import { t } from '../i18n';

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

// Pin negro con casa amarilla para elegir un punto (sin texto de usuario: es seguro como HTML fijo)
export const PIN_CASA_HTML = `
  <div class="m3d-pin__icono">
    <svg width="44" height="56" viewBox="0 0 44 56" aria-hidden="true">
      <ellipse cx="22" cy="53" rx="7" ry="2.5" fill="rgba(0,0,0,0.28)"/>
      <path d="M22 2C11.5 2 3 10.3 3 20.6 3 34.5 22 52 22 52S41 34.5 41 20.6C41 10.3 32.5 2 22 2Z"
            fill="#0F172A" stroke="#FFFFFF" stroke-width="2.5"/>
      <path d="M22 11.5 13.5 18.6V29h6.2v-6h4.6v6h6.2V18.6Z" fill="#FACC15"/>
    </svg>
  </div>`;

// Pin fijo en el centro del mapa (no recibe toques: arrastrar encima mueve el mapa).
// Devuelve una función para quitarlo (el mapa de fondo es compartido: cada pantalla limpia lo suyo).
export const crearPinCentro = (map) => {
  const el = document.createElement('div');
  el.className = 'm3d-pin';
  el.innerHTML = PIN_CASA_HTML;
  const pin = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 4] }).setLngLat(map.getCenter()).addTo(map);
  const seguir = () => pin.setLngLat(map.getCenter());
  map.on('move', seguir);
  return () => { map.off('move', seguir); pin.remove(); };
};

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
  lng: Number(c.longitud),
  lat: Number(c.latitud),
  direccion: c.direccion || '',
  estado: c.estado || 'Pendiente',
  color: STATUS_COLORS[c.estado]?.hex || '#9CA3AF',
  offline: !!c._offline,
});

// Color más oscuro (techo de las casitas)
const oscurecer = (hex, f = 0.68) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return hex;
  return `rgb(${Math.round(((n >> 16) & 255) * f)}, ${Math.round(((n >> 8) & 255) * f)}, ${Math.round((n & 255) * f)})`;
};

// Color más claro (casita 3D bajo el mouse)
const aclarar = (color, f = 0.45) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color));
  const rgb = m
    ? [0, 8, 16].map(sh => (parseInt(m[1], 16) >> (16 - sh)) & 255)
    : (String(color).match(/\d+/g) || [128, 128, 128]).slice(0, 3).map(Number);
  return `rgb(${rgb.map(v => Math.round(v + (255 - v) * f)).join(', ')})`;
};

// Casita 3D: paredes + techo de dos aguas (franjas que se angostan hacia la cumbrera).
// Cada parte lleva base/tope (metros) y colorParte; `props` = datos de la casa (para los toques).
export const casaPartes = (lng, lat, { lado = 8, pared = 3.2, techo = 2.6, colorPared, colorTecho, props = {} } = {}) => {
  const dLat = (lado / 2) / 111320;
  const dLng = (lado / 2) / (111320 * Math.cos(lat * Math.PI / 180));
  const rect = (fx, fy) => [[
    [lng - dLng * fx, lat - dLat * fy], [lng + dLng * fx, lat - dLat * fy],
    [lng + dLng * fx, lat + dLat * fy], [lng - dLng * fx, lat + dLat * fy],
    [lng - dLng * fx, lat - dLat * fy],
  ]];
  const parte = (coords, base, tope, colorParte) => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: coords }, properties: { ...props, base, tope, colorParte, colorHover: aclarar(colorParte) },
  });
  const ANCHOS = [1.12, 0.84, 0.56, 0.28]; // alero → cumbrera
  const paso = techo / ANCHOS.length;
  return [
    parte(rect(1, 1), 0, pared, colorPared),
    ...ANCHOS.map((fx, i) => parte(rect(fx, 1.12), pared + i * paso, pared + (i + 1) * paso, colorTecho)),
  ];
};

export const casasBloquesGeoJSON = (casas) => ({
  type: 'FeatureCollection',
  features: (casas || []).flatMap(c => {
    const p = coordsCasa(c);
    if (!p) return [];
    const props = propsCasa(c);
    return casaPartes(p[0], p[1], { colorPared: props.color, colorTecho: oscurecer(props.color), props });
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

// Bloque amarillo de lo seleccionado: el edificio de OSM bajo el pin
export const seleccionGeoJSON = (geometria, altura = 5) => (
  geometria
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geometria, properties: { altura } }] }
    : VACIO
);

// Casita amarilla (un poco más grande) para una casa seleccionada o el punto del pin
export const seleccionCasaGeoJSON = (lng, lat) => ({
  type: 'FeatureCollection',
  features: casaPartes(lng, lat, { lado: 9, pared: 3.6, techo: 3, colorPared: AMARILLO, colorTecho: '#CA8A04' }),
});

// ── Íconos de casita (de lejos) ──
// Se dibujan en un canvas por color cuando el mapa los pide (styleimagemissing), así también se
// vuelven a poner solos después de cambiar de estilo. Id: casa-<color>[-off] (off = sin sincronizar).
const PATH_CASA = 'M16 2 L3 14 L6 14 L6 30 L26 30 L26 14 L29 14 Z';
const dibujarIconoCasa = (color, offline) => {
  const escala = 2;
  const c = document.createElement('canvas');
  c.width = 32 * escala; c.height = 36 * escala;
  const ctx = c.getContext('2d');
  ctx.scale(escala, escala);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
  const casa = new Path2D(PATH_CASA);
  ctx.fillStyle = color; ctx.fill(casa);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.strokeStyle = '#FFFFFF';
  if (offline) ctx.setLineDash([4, 2]);
  ctx.stroke(casa);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(12.5, 19, 7, 11);
  if (offline) {
    ctx.beginPath(); ctx.arc(25, 7, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#F59E0B'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  }
  return ctx.getImageData(0, 0, c.width, c.height);
};
const prepararIconosCasa = (map) => {
  if (map.__iconosCasa) return;
  map.__iconosCasa = true;
  const resolver = (id) => {
    const m = /^casa-(.+?)(-off)?$/.exec(id || '');
    if (!m || map.hasImage(id)) return;
    map.addImage(id, dibujarIconoCasa(m[1], !!m[2]), { pixelRatio: 2 });
  };
  // MapLibre 6: el mapa pide las imágenes que faltan al "resolver" (el evento solo llega si este no la da)
  if (typeof map.setMissingStyleImageResolver === 'function') map.setMissingStyleImageResolver(resolver);
  else map.on('styleimagemissing', (e) => resolver(e.id));
};

// Marcador DOM de un exhibidor (anaquel en un pin). Color de la BD con style, nombre con textContent.
export const crearMarcadorExhibidor = (exh, seleccionado, onClick) => {
  const el = document.createElement('div');
  el.className = `m3d-exhibidor-wrap${seleccionado ? ' is-sel' : ''}`;
  const icono = document.createElement('div');
  icono.className = 'm3d-exhibidor';
  icono.style.background = exh.color || '#F59E0B';
  el.style.setProperty('--c', exh.color || '#F59E0B');
  icono.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${EXHIBIDOR_ICON_SVG_PATHS}</svg>`;
  const nombre = document.createElement('span');
  nombre.className = 'm3d-exhibidor__nombre';
  nombre.textContent = exh.nombre || '';
  el.append(nombre, icono); // nombre arriba, pin abajo (anchor bottom = punta en el lugar)
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick?.(); });
  return el;
};

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

// Las casas usan su id como id de feature: así el hover ilumina todas las partes de la casita
const CON_ID = ['casas-bloques', 'casas-puntos'];
const ponerFuente = (map, id, data) => {
  const fuente = map.getSource(id);
  if (fuente) fuente.setData(data);
  else map.addSource(id, { type: 'geojson', data, ...(CON_ID.includes(id) ? { promoteId: 'id' } : {}) });
};

// ── Mapa neón: negro con calles en blanco brillante (sobre el estilo oscuro de OpenFreeMap) ──
const NEON_FONDO = '#000000';
const pintar = (map, id, prop, valor) => { try { map.setPaintProperty(id, prop, valor); } catch { /* capa sin esa propiedad */ } };
const aplicarNeon = (map) => {
  const capas = map.getStyle()?.layers || [];
  let primeraCalle = null;
  capas.forEach(l => {
    const sl = l['source-layer'];
    if (l.type === 'background') pintar(map, l.id, 'background-color', NEON_FONDO);
    else if (l.type === 'fill') {
      if (sl === 'water') pintar(map, l.id, 'fill-color', '#03111F');
      else if (sl === 'building') pintar(map, l.id, 'fill-color', '#0E0F12');
      else if (/park|wood/.test(l.id)) pintar(map, l.id, 'fill-color', '#04100A');
      else pintar(map, l.id, 'fill-color', '#050608');
    } else if (l.type === 'line') {
      if (sl === 'transportation') {
        if (!primeraCalle) primeraCalle = l.id;
        if (/railway/.test(l.id)) pintar(map, l.id, 'line-color', /dashline/.test(l.id) ? NEON_FONDO : '#3F3F46');
        else if (/motorway/.test(l.id)) pintar(map, l.id, 'line-color', '#FFFFFF');
        else if (/major/.test(l.id)) pintar(map, l.id, 'line-color', /casing/.test(l.id) ? '#9CA3AF' : '#F1F5F9');
        else pintar(map, l.id, 'line-color', /path/.test(l.id) ? '#52525B' : '#A1A1AA');
      } else if (sl === 'waterway') pintar(map, l.id, 'line-color', '#0C4A6E');
      else if (sl === 'boundary') pintar(map, l.id, 'line-color', '#3F3F46');
    } else if (l.type === 'symbol' && l.layout?.['text-field']) {
      pintar(map, l.id, 'text-color', sl === 'water_name' ? '#38BDF8' : '#F8FAFC');
      pintar(map, l.id, 'text-halo-color', 'rgba(255,255,255,0.22)');
      pintar(map, l.id, 'text-halo-width', 1);
      pintar(map, l.id, 'text-halo-blur', 2);
    }
  });
  // Brillo blanco difuminado debajo de las calles
  if (primeraCalle && !map.getLayer('neon-calles')) {
    map.addLayer({
      id: 'neon-calles', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit', 'path', 'ferry']]]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2, 14, 6, 18, 22],
        'line-blur': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2, 14, 5, 18, 16],
        'line-opacity': 0.13,
      },
    }, primeraCalle);
  }
};

// Agrega (o vuelve a agregar tras cambiar de estilo) todas las capas propias.
// `datos` = { [idFuente]: GeoJSON } (ver FUENTES); lo que falte queda vacío.
export const agregarCapas = (map, datos = {}, { oscuro = false, satelite = false, neon = false } = {}) => {
  prepararIconosCasa(map);
  if (neon && !satelite && map.getSource('openmaptiles')) aplicarNeon(map);
  const brillo = oscuro || satelite; // sobre fondo oscuro el neón luce más
  FUENTES.forEach(id => ponerFuente(map, id, datos[id] || VACIO));
  ponerFuente(map, 'territorios-etq', etiquetasGeoJSON(datos.territorios || VACIO));
  ponerFuente(map, 'casa-hover', VACIO);

  // Lo 3D va debajo de los textos del mapa base (calles, colonias)
  const antes = primeraCapaDeTexto(map);
  const capa = (def, beforeId = antes) => { if (!map.getLayer(def.id)) map.addLayer(def, beforeId); };

  capa({
    id: 'territorios-relleno', type: 'fill', source: 'territorios',
    // colorRelleno (opcional): relleno distinto al borde (p. ej. color del progreso en Territorios)
    paint: { 'fill-color': ['coalesce', ['get', 'colorRelleno'], ['get', 'color']], 'fill-opacity': ['coalesce', ['get', 'relleno'], satelite ? 0.18 : 0.12] },
  });
  // Geocercas: brillo difuminado del color del territorio + borde nítido (efecto neón)
  capa({
    id: 'territorios-brillo', type: 'line', source: 'territorios',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 17, 16],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 11, 4, 17, 12],
      'line-opacity': brillo ? 0.6 : 0.35,
    },
  });
  capa({
    id: 'territorios-borde', type: 'line', source: 'territorios',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 3], 'line-opacity': 1 },
  });
  // Manzanas: punteado fino con un brillo tenue (no compiten con el territorio)
  capa({
    id: 'manzanas-brillo', type: 'line', source: 'manzanas',
    paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-blur': 4, 'line-opacity': brillo ? 0.3 : 0.15 },
  });
  capa({
    id: 'manzanas-borde', type: 'line', source: 'manzanas',
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.3, 'line-dasharray': [2, 2], 'line-opacity': 0.85 },
  });

  // Edificios de OpenStreetMap en 3D (solo si el estilo tiene la fuente vectorial)
  if (map.getSource('openmaptiles')) {
    capa({
      id: 'edificios-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': neon && !satelite ? '#16181D' : oscuro ? '#334155' : '#E2E8F0',
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

  // Casas registradas: de cerca, casitas 3D (paredes del color del estado, techo más oscuro)
  capa({
    id: 'casas-3d', type: 'fill-extrusion', source: 'casas-bloques', minzoom: 16.5,
    paint: {
      'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'hover'], false],
        ['coalesce', ['get', 'colorHover'], '#FFFFFF'], ['coalesce', ['get', 'colorParte'], ['get', 'color']]],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 16.5, 0, 17.5, ['get', 'tope']],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 16.5, 0, 17.5, ['get', 'base']],
      'fill-extrusion-opacity': 0.95,
    },
  });
  // Lo seleccionado: edificio de OSM (altura) o casita amarilla (base/tope/colorParte)
  capa({
    id: 'seleccion-3d', type: 'fill-extrusion', source: 'seleccion',
    paint: {
      'fill-extrusion-color': ['coalesce', ['get', 'colorParte'], AMARILLO],
      'fill-extrusion-height': ['coalesce', ['get', 'tope'], ['+', ['get', 'altura'], 0.6]],
      'fill-extrusion-base': ['coalesce', ['get', 'base'], 0],
      'fill-extrusion-opacity': 0.95,
    },
  });
  capa({
    id: 'casa-hover-brillo', type: 'circle', source: 'casa-hover',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 12, 16, 26],
      'circle-blur': 0.85,
      'circle-opacity': 0.85,
    },
  });
  // De lejos: ícono de casita del color del estado (borde punteado + punto naranja = sin sincronizar).
  // Se llama "casas-punto" para que los toques de las pantallas sigan igual.
  capa({
    id: 'casas-punto', type: 'symbol', source: 'casas-puntos', maxzoom: 17.5,
    layout: {
      'icon-image': ['concat', 'casa-', ['get', 'color'], ['case', ['get', 'offline'], '-off', '']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.45, 14, 0.7, 16.5, 1],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
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
    paint: brillo
      ? { 'text-color': '#FFFFFF', 'text-halo-color': ['get', 'color'], 'text-halo-width': 2.4, 'text-halo-blur': 2 }
      : { 'text-color': ['get', 'color'], 'text-halo-color': '#FFFFFF', 'text-halo-width': 2 },
  }, undefined);
};

// ── Hover de casas (solo con mouse): brillo de su color, casita 3D iluminada y tarjeta neón ──
// Devuelve la función que lo quita. El texto de la tarjeta va con textContent.
export const activarHoverCasas = (map) => {
  if (!window.matchMedia?.('(hover: hover)').matches) return () => {};
  const CAPAS = ['casas-punto', 'casas-3d'];
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'm3d-tooltip', offset: [0, -30], maxWidth: '260px' });
  let actual = null;
  const limpiar = () => {
    if (actual != null) {
      try { map.setFeatureState({ source: 'casas-bloques', id: actual }, { hover: false }); } catch { /* sin fuente */ }
    }
    actual = null;
    map.getSource('casa-hover')?.setData(VACIO);
    popup.remove();
    map.getCanvas().style.cursor = '';
  };
  const mover = (e) => {
    const capas = CAPAS.filter(id => map.getLayer(id));
    const f = capas.length ? map.queryRenderedFeatures(e.point, { layers: capas })[0] : null;
    if (!f) { if (actual != null) limpiar(); return; }
    map.getCanvas().style.cursor = 'pointer';
    const p = f.properties;
    if (p.id === actual) return;
    limpiar();
    actual = p.id;
    map.getCanvas().style.cursor = 'pointer';
    try { map.setFeatureState({ source: 'casas-bloques', id: p.id }, { hover: true }); } catch { /* sin fuente */ }
    const lng = Number(p.lng); const lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    map.getSource('casa-hover')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { color: p.color } }] });
    const div = document.createElement('div');
    div.className = 'm3d-tooltip__cuerpo';
    const dir = document.createElement('strong');
    dir.textContent = p.direccion || '—';
    const estado = document.createElement('span');
    estado.className = 'm3d-tooltip__estado';
    estado.textContent = t(p.estado);
    estado.style.background = p.color;
    div.append(dir, estado);
    popup.setLngLat([lng, lat]).setDOMContent(div).addTo(map);
    popup.getElement()?.style.setProperty('--c', p.color);
  };
  map.on('mousemove', mover);
  map.getCanvas().addEventListener('mouseleave', limpiar);
  map.on('movestart', limpiar);
  return () => {
    map.off('mousemove', mover);
    map.getCanvas().removeEventListener('mouseleave', limpiar);
    map.off('movestart', limpiar);
    limpiar();
  };
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
