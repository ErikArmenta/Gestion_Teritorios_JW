import { useEffect, useRef, useState } from 'react';
import { maplibregl, estiloPara, agregarCapas, actualizarFuente } from '../utils/map3d';

// Ciclo de vida de un mapa 3D (MapLibre) — lo comparten TerritoriesMap3D y RegisterHouse3D.
//  - Crea el mapa una sola vez con: crédito compacto, "Mi ubicación" (GeolocateControl, arriba a la
//    izquierda, sigue al usuario) y brújula/inclinación.
//  - Cambia de estilo (claro / oscuro / satélite) y vuelve a poner las capas propias en cada style.load.
//  - Inclina o aplana (prefs.tresD) y actualiza solo las fuentes cuyos datos cambiaron.
//  - alCrear(map, geo): eventos propios de cada pantalla (clics, pin…). Se llama una vez.
//  - onFallo(): sin WebGL2 o el navegador negó el contexto → la pantalla usa su vista clásica.
//
// `datos` = { [idFuente]: GeoJSON } (ver FUENTES en utils/map3d.js). Cada GeoJSON debe venir de un
// useMemo: solo se manda al mapa la fuente cuyo objeto cambió.
export const PITCH_3D = 55;

// Preferencias (2D/3D, satélite): utils/prefs3d.js
export { leerPrefs3D, guardarPrefs3D } from '../utils/prefs3d';

const CENTRO_DEFAULT = [-106.4850, 31.7619];

export default function useMapa3D(contenedorRef, {
  prefs, oscuro, datos, alCrear, onFallo, autoUbicar = false, pitch = PITCH_3D,
}) {
  const mapRef = useRef(null);
  const geoRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  // Lo último, para style.load (que llega cuando quiere)
  const datosRef = useRef(datos);
  // Neón: siempre en modo oscuro; en modo claro, si se eligió el botón (prefs.neon). El satélite manda.
  const neon = !prefs.satelite && (oscuro || !!prefs.neon);
  const baseOscura = oscuro || neon;
  const opcionesRef = useRef({ oscuro: baseOscura, satelite: prefs.satelite, neon });
  const alCrearRef = useRef(alCrear);
  const onFalloRef = useRef(onFallo);
  useEffect(() => {
    datosRef.current = datos;
    opcionesRef.current = { oscuro: baseOscura, satelite: prefs.satelite, neon };
    alCrearRef.current = alCrear;
    onFalloRef.current = onFallo;
  });

  const estiloRef = useRef(null);
  const enviadosRef = useRef({}); // GeoJSON ya mandado por fuente

  // ── Crear (una sola vez) ──
  useEffect(() => {
    let map;
    const estiloInicial = estiloPara(prefs.satelite, baseOscura);
    try {
      map = new maplibregl.Map({
        container: contenedorRef.current,
        style: estiloInicial,
        center: CENTRO_DEFAULT,
        zoom: 13,
        pitch: prefs.tresD ? pitch : 0,
        maxPitch: 70,
        attributionControl: false,
      });
    } catch (err) {
      console.error('Mapa 3D no disponible:', err);
      onFalloRef.current?.();
      return undefined;
    }
    mapRef.current = map;
    estiloRef.current = estiloInicial;
    // Solo en desarrollo: el último mapa creado queda en window.__mapas3d (para depurar en la consola)
    if (import.meta.env.DEV) window.__mapas3d = [...(window.__mapas3d || []), map];

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    const geo = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
      trackUserLocation: true,
      showAccuracyCircle: true,
      fitBoundsOptions: { maxZoom: 18 },
    });
    geoRef.current = geo;
    map.addControl(geo, 'top-left');
    map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-left');

    map.on('style.load', () => {
      agregarCapas(map, datosRef.current, opcionesRef.current);
      enviadosRef.current = { ...datosRef.current };
      setListo(true);
      setSinConexion(false);
    });
    map.on('load', () => {
      // El crédito empieza cerrado (botón ⓘ): abierto tapa medio mapa en el celular
      contenedorRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      if (autoUbicar) geo.trigger();
    });
    map.on('error', (e) => {
      // Solo importa si no cargó el estilo (sin internet y sin caché); un mosaico perdido no
      if (!map.isStyleLoaded()) setSinConexion(true);
      console.warn('Mapa 3D:', e?.error?.message || e);
    });

    alCrearRef.current?.(map, geo);

    // El contenedor cambia de alto (panel inferior) → reajustar
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.resize());
      ro.observe(contenedorRef.current);
    }

    return () => {
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      geoRef.current = null;
    };
    // Se crea una sola vez; estilo, inclinación y datos se actualizan en los efectos de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Claro / oscuro / satélite
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const estilo = estiloPara(prefs.satelite, baseOscura);
    if (estiloRef.current === estilo) return;
    estiloRef.current = estilo;
    map.setStyle(estilo, { diff: false });
  }, [prefs.satelite, baseOscura]);

  // 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: prefs.tresD ? pitch : 0, ...(prefs.tresD ? {} : { bearing: 0 }), duration: 700 });
  }, [prefs.tresD, pitch]);

  // Datos nuevos → solo las fuentes que cambiaron
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    Object.entries(datos).forEach(([id, data]) => {
      if (enviadosRef.current[id] === data) return;
      actualizarFuente(map, id, data);
      enviadosRef.current[id] = data;
    });
  }, [listo, datos]);

  return { mapRef, geoRef, listo, sinConexion };
}
