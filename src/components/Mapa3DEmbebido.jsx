import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import useMapa3D, { leerPrefs3D } from '../hooks/useMapa3D';
import {
  maplibregl, poligonosGeoJSON, casasPuntosGeoJSON, casasBloquesGeoJSON, limitesDe, crearPinCentro,
} from '../utils/map3d';
import { EXHIBIDOR_ICON_SVG_PATHS } from '../utils/constants';

// Mapa 3D pequeño dentro de una página o modal (no es pantalla completa). Se carga aparte
// (import dinámico desde components/MapaConRespaldo.jsx, que pone Leaflet si no hay WebGL2).
//  - modo="selector": pin fijo al centro; mueves el mapa o tocas un punto y onCambiar({lat,lng}).
//  - modo="puntos": muestra `puntos` [{ id, lat, lng, color }] (exhibidores) y encuadra en ellos.
// Siempre muestra los territorios; `mostrarCasas` agrega las casas.

const PITCH_EMBEBIDO = 45;
const iguales = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

// Marcador de exhibidor: el color viene de la BD → se asigna con style (nunca dentro de HTML)
const marcadorExhibidor = (color) => {
  const el = document.createElement('div');
  el.className = 'm3d-exhibidor';
  el.style.background = color || '#F59E0B';
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${EXHIBIDOR_ICON_SVG_PATHS}</svg>`;
  return el;
};

// `centro` ([lat, lng], como Leaflet): vista inicial del selector cuando aún no hay posición.
// No cuenta como posición elegida (onCambiar solo se llama cuando el usuario mueve o toca el mapa).
const Mapa3DEmbebido = ({ modo = 'puntos', posicion, onCambiar, puntos, centro, alto = 'min(450px, 55dvh)', mostrarCasas = false, onFallo }) => {
  const { territorios, casas } = useData();
  const { theme } = useTheme();
  const divRef = useRef(null);
  const [prefs] = useState(leerPrefs3D);
  const [moviendo, setMoviendo] = useState(false);
  const onCambiarRef = useRef(onCambiar);
  const ultimaRef = useRef(posicion || null); // última posición del pin (para no rebotar con el padre)
  const marcadoresRef = useRef([]);
  const encuadradoRef = useRef(false);
  useEffect(() => { onCambiarRef.current = onCambiar; });

  const datos = useMemo(() => ({
    territorios: poligonosGeoJSON(territorios),
    ...(mostrarCasas ? { 'casas-puntos': casasPuntosGeoJSON(casas), 'casas-bloques': casasBloquesGeoJSON(casas) } : {}),
  }), [territorios, casas, mostrarCasas]);

  const alCrear = (map) => {
    if (modo !== 'selector') return;
    // Antes de escuchar moveend: este salto inicial no se reporta como elección del usuario
    if (posicion) map.jumpTo({ center: [posicion.lng, posicion.lat], zoom: 17 });
    else if (centro) map.jumpTo({ center: [Number(centro[1]), Number(centro[0])], zoom: 15 });
    crearPinCentro(map);
    map.on('movestart', () => setMoviendo(true));
    map.on('moveend', () => {
      const c = map.getCenter();
      const p = { lat: c.lat, lng: c.lng };
      setMoviendo(false);
      if (iguales(p, ultimaRef.current)) return;
      ultimaRef.current = p;
      onCambiarRef.current?.(p);
    });
    map.on('click', (e) => map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), 17), duration: 500 }));
  };

  const { mapRef, listo } = useMapa3D(divRef, {
    prefs, oscuro: theme === 'dark', datos, alCrear, onFallo, pitch: PITCH_EMBEBIDO,
  });

  // El padre cambió la posición (p. ej. otro control): mover el mapa allí
  useEffect(() => {
    const map = mapRef.current;
    if (modo !== 'selector' || !map || !posicion || iguales(posicion, ultimaRef.current)) return;
    ultimaRef.current = posicion;
    map.jumpTo({ center: [posicion.lng, posicion.lat] });
  }, [modo, posicion, mapRef]);

  // Marcadores (modo puntos) + encuadre inicial
  useEffect(() => {
    const map = mapRef.current;
    if (modo !== 'puntos' || !map || !listo) return undefined;
    marcadoresRef.current.forEach(m => m.remove());
    const validos = (puntos || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    marcadoresRef.current = validos.map(p => new maplibregl.Marker({ element: marcadorExhibidor(p.color) })
      .setLngLat([Number(p.lng), Number(p.lat)])
      .addTo(map));
    if (!encuadradoRef.current) {
      const fc = {
        type: 'FeatureCollection',
        features: validos.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(p.lng), Number(p.lat)] }, properties: {} })),
      };
      const limites = limitesDe(fc.features.length ? fc : datos.territorios);
      if (limites) {
        encuadradoRef.current = true;
        map.fitBounds(limites, { padding: 50, maxZoom: 16, duration: 0 });
      }
    }
    return () => { marcadoresRef.current.forEach(m => m.remove()); marcadoresRef.current = []; };
  }, [modo, puntos, listo, mapRef, datos.territorios]);

  return (
    <div className="m3d-embebido" style={{ height: alto }}>
      <div ref={divRef} className={`m3d-canvas${moviendo ? ' is-moving' : ''}`} />
    </div>
  );
};

export default Mapa3DEmbebido;
