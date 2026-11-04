// Dibujo de polígonos sobre los mapas 3D (MapLibre) con Terra Draw: crear territorios y manzanas
// (polígono o rectángulo) y editar su forma (mover vértices, agregar puntos en medio de un lado).
// Lo usa pages/TerritoriosAdmin3D.jsx. Se carga solo con esa pantalla.
//
// Formato: la app guarda los polígonos como Leaflet → [[lat, lng], ...] SIN repetir el primer punto.
// Se mantiene igual para que la vista clásica, los links compartidos y el pánico (Leaflet) los lean.
import {
  TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { anilloGeoJSON } from './map3d';

const PRECISION = 9; // Terra Draw rechaza coordenadas con más decimales
const redondear = (n) => Number(n.toFixed(PRECISION));

const VERDE = '#16A34A';
const AMARILLO = '#FACC15';
const NEGRO = '#0F172A';

// [[lat,lng],...] (Leaflet) → Feature de Terra Draw (anillo cerrado [lng,lat])
export const featureDesdeCoords = (coordenadas) => {
  const anillo = anilloGeoJSON(coordenadas);
  if (!anillo) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [anillo.map(([lng, lat]) => [redondear(lng), redondear(lat)])] },
    properties: { mode: 'polygon' },
  };
};

// Feature (Polygon) → [[lat,lng],...] sin repetir el primer punto
export const coordsDesdeFeature = (feature) => {
  const anillo = feature?.geometry?.type === 'Polygon' ? feature.geometry.coordinates[0] : null;
  if (!anillo || anillo.length < 4) return null;
  const abierto = anillo.slice(0, -1);
  return abierto.map(([lng, lat]) => [lat, lng]);
};

/**
 * Crea una sesión de dibujo sobre `map`. Devuelve la instancia de Terra Draw ya iniciada.
 * onTerminar(feature, modo) se llama cuando se termina de DIBUJAR un polígono/rectángulo nuevo.
 * Para terminar la sesión: draw.stop().
 */
export const crearDibujo = (map, { onTerminar } = {}) => {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: PRECISION }),
    modes: [
      new TerraDrawPolygonMode({
        showCoordinatePoints: true, // cada punto tocado se ve (en el celular ayuda mucho)
        styles: {
          fillColor: VERDE, fillOpacity: 0.25, outlineColor: VERDE, outlineWidth: 3,
          closingPointColor: AMARILLO, closingPointWidth: 9, closingPointOutlineColor: NEGRO, closingPointOutlineWidth: 2,
          coordinatePointColor: '#FFFFFF', coordinatePointWidth: 5, coordinatePointOutlineColor: VERDE, coordinatePointOutlineWidth: 2,
        },
      }),
      new TerraDrawRectangleMode({
        styles: { fillColor: VERDE, fillOpacity: 0.25, outlineColor: VERDE, outlineWidth: 3 },
      }),
      new TerraDrawSelectMode({
        allowManualDeselection: false, // tocar fuera no suelta la figura que se está editando
        allowManualSelection: false,
        flags: {
          polygon: {
            feature: {
              draggable: false,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
        styles: {
          selectedPolygonColor: AMARILLO,
          selectedPolygonFillOpacity: 0.25,
          selectedPolygonOutlineColor: NEGRO,
          selectedPolygonOutlineWidth: 3,
          selectionPointColor: AMARILLO,
          selectionPointWidth: 9,
          selectionPointOutlineColor: NEGRO,
          selectionPointOutlineWidth: 2,
          midPointColor: '#FFFFFF',
          midPointOutlineColor: NEGRO,
          midPointWidth: 6,
          midPointOutlineWidth: 2,
        },
      }),
    ],
  });
  draw.start();
  draw.on('finish', (id, ctx) => {
    if (ctx?.action !== 'draw' || !['polygon', 'rectangle'].includes(ctx.mode)) return;
    const feature = draw.getSnapshotFeature(id);
    if (feature) onTerminar?.(feature, ctx.mode);
  });
  return draw;
};

/** Pone un polígono existente en modo edición (vértices arrastrables). Devuelve su id o null si es inválido. */
export const editarForma = (draw, coordenadas) => {
  const feature = featureDesdeCoords(coordenadas);
  if (!feature) return null;
  draw.setMode('select');
  const [res] = draw.addFeatures([feature]);
  if (!res?.valid) {
    console.warn('Forma no editable:', res?.reason);
    return null;
  }
  draw.selectFeature(res.id);
  return res.id;
};
