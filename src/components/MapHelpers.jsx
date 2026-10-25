import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';

// Control de dibujo (polígono / rectángulo) para crear territorios o manzanas.
export const CustomEditControl = ({ onCreated }) => {
  const map = useMap();
  useEffect(() => {
    if (map.__drawControlAdded) return;
    map.__drawControlAdded = true;
    const drawControl = new L.Control.Draw({
      draw: { polyline: false, polygon: true, circle: false, circlemarker: false, marker: false, rectangle: true },
      edit: false,
    });
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, onCreated);
    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED, onCreated);
      map.__drawControlAdded = false;
    };
  }, [map, onCreated]);
  return null;
};

// Encuadra el mapa a los territorios dados.
// Solo vuelve a encuadrar cuando cambia el CONJUNTO de territorios (sus ids) o `fitKey`;
// depender del array en sí hacía que el mapa saltara en cada render (p. ej. con un filtro).
export const GlobalMapFitter = ({ territorios, fitKey }) => {
  const map = useMap();
  const ids = (territorios || []).map(t => t.id).join(',');
  useEffect(() => {
    const all = (territorios || []).flatMap(t => t.coordenadas || []);
    if (!all.length) return;
    try {
      const bounds = L.latLngBounds(all);
      if (!bounds.isValid()) return;
      const timer = setTimeout(() => {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: true });
      }, 50);
      return () => clearTimeout(timer);
    } catch (err) {
      console.error('GlobalMapFitter error:', err);
    }
  }, [ids, map, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};
