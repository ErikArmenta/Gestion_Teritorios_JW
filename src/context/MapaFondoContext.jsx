import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { soportaWebGL2 } from '../utils/webgl';
import { leerPrefs3D, guardarPrefs3D } from '../utils/prefs3d';

// UN SOLO mapa 3D para todas las pantallas con mapa (mapa principal, Registrar casa, Territorios).
// Vive en el layout (components/MapaFondo.jsx) y no se recarga al cambiar de pantalla; cada pantalla
// le dice qué mostrar con useMapaPagina({ datos, alCrear }):
//  - datos: { [idFuente]: GeoJSON } (de useMemo). Lo que la pantalla no mande queda vacío.
//  - alCrear(map, geo): eventos propios (clics, pin…). DEBE devolver una función que los quite:
//    el mapa sigue vivo al salir de la pantalla.
// En escritorio el panel de cada pantalla va dentro del menú flotante (components/PanelMapa.jsx).

const MapaFondoContext = createContext(null);

export const useMapaFondo = () => useContext(MapaFondoContext);

export function MapaFondoProvider({ children }) {
  const [webgl] = useState(soportaWebGL2);
  const [fallo, setFallo] = useState(false);
  const disponible = webgl && !fallo;

  const [prefs, setPrefs] = useState(leerPrefs3D);
  const cambiarPrefs = useCallback((cambio) => setPrefs(p => { const n = { ...p, ...cambio }; guardarPrefs3D(n); return n; }), []);

  const [datosPagina, setDatosPagina] = useState(null);
  const [instancia, setInstancia] = useState({ listo: false, sinConexion: false });
  const mapRef = useRef(null);  // los llena MapaFondo
  const geoRef = useRef(null);
  const ubicarRef = useRef(null);

  const [slotPanel, setSlotPanel] = useState(null);   // contenedor del panel dentro del menú flotante
  const [altoPanel, setAltoPanel] = useState(0);      // alto del panel inferior (móvil)
  const [bloquearEstilo, setBloquearEstilo] = useState(false); // dibujando: no cambiar estilo

  // MapaFondo registra aquí su mapa, su control de ubicación y su función "ubicarme"
  const registrarMapa = useCallback((map, geo, ubicar) => {
    mapRef.current = map;
    geoRef.current = geo;
    ubicarRef.current = ubicar;
  }, []);

  const valor = useMemo(() => ({
    disponible,
    marcarFallo: () => setFallo(true),
    reintentar: () => setFallo(false),
    prefs, cambiarPrefs,
    datosPagina, setDatosPagina,
    mapRef, geoRef, ubicarRef, registrarMapa,
    listo: instancia.listo, sinConexion: instancia.sinConexion, setInstancia,
    slotPanel, setSlotPanel,
    altoPanel, setAltoPanel,
    bloquearEstilo, setBloquearEstilo,
  }), [disponible, prefs, cambiarPrefs, datosPagina, instancia, registrarMapa, slotPanel, altoPanel, bloquearEstilo]);

  return <MapaFondoContext.Provider value={valor}>{children}</MapaFondoContext.Provider>;
}

/**
 * Para las pantallas con mapa. Devuelve { mapRef, geoRef, listo, sinConexion, prefs, ubicar, … }.
 * alCrear(map, geo) se llama cuando el mapa está listo y debe devolver la limpieza.
 */
export function useMapaPagina({ datos, alCrear }) {
  const ctx = useMapaFondo();
  const { setDatosPagina, mapRef, geoRef, listo } = ctx;

  useEffect(() => { setDatosPagina(datos); }, [datos, setDatosPagina]);
  useEffect(() => () => setDatosPagina(null), [setDatosPagina]);

  const alCrearRef = useRef(alCrear);
  useEffect(() => { alCrearRef.current = alCrear; });
  useEffect(() => {
    const map = mapRef.current;
    if (!listo || !map) return undefined;
    const limpiar = alCrearRef.current?.(map, geoRef.current);
    return () => { try { limpiar?.(); } catch { /* el mapa ya no existe */ } };
  }, [listo, mapRef, geoRef]);

  const ubicar = useCallback(() => ctx.ubicarRef.current?.(), [ctx.ubicarRef]);
  return { ...ctx, ubicar };
}
