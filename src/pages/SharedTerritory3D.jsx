import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import { MapPinned, Navigation, X, Loader2, Route, Home } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import useMapa3D, { leerPrefs3D, guardarPrefs3D } from '../hooks/useMapa3D';
import BotonesMapa3D from '../components/BotonesMapa3D';
import {
  maplibregl, poligonosGeoJSON, casasPuntosGeoJSON, casasBloquesGeoJSON, seleccionCasaGeoJSON,
  coordsCasa, limitesDe, activarHoverCasas, VACIO,
} from '../utils/map3d';
import { STATUS_COLORS } from '../utils/constants';
import { t } from '../i18n';

// Link compartido (/shared/:id) en 3D. Se carga aparte (import dinámico desde SharedTerritory.jsx,
// que deja el mapa Leaflet de siempre como respaldo: sin WebGL2 o si esto truena).
// Solo consulta: el territorio, sus casas (toca una para ver sus datos) y "Cómo llegar":
// la ruta en coche de tu ubicación al centro del territorio, dibujada en el mapa (OSRM de FOSSGIS,
// el mismo que usa openstreetmap.org; solo al tocar el botón) + abrir Google Maps / Waze para navegar.
// Si el servicio de rutas no responde, se dibuja una línea recta con la distancia aproximada.
const RUTAS_URL = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';

const formatoDistancia = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
const formatoDuracion = (s) => {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

const pedirUbicacion = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error('sin geolocalización')); return; }
  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
});

const buscarRuta = async (origen, destino) => {
  const ctrl = new AbortController();
  const tiempo = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${RUTAS_URL}/${origen.join(',')};${destino.join(',')}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    const j = await r.json();
    const ruta = j?.routes?.[0];
    if (!ruta?.geometry) throw new Error('sin ruta');
    return { geometria: ruta.geometry, distancia: ruta.distance, duracion: ruta.duration, aproximada: false };
  } finally { clearTimeout(tiempo); }
};

// Marcadores DOM (sin texto de usuario)
const marcador = (clase) => { const el = document.createElement('div'); el.className = clase; return el; };

const SharedTerritory3D = ({ territorio, casas, onFallo }) => {
  const { theme } = useTheme();
  const oscuro = theme === 'dark';
  const divRef = useRef(null);
  const hojaRef = useRef(null);
  const [prefs, setPrefs] = useState(leerPrefs3D);
  const [casaSel, setCasaSel] = useState(null);
  const [ruta, setRuta] = useState(null); // { geometria, distancia, duracion, aproximada, origen }
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [altoHoja, setAltoHoja] = useState(0);
  const marcadoresRef = useRef([]);
  const encuadradoRef = useRef(false);

  const cambiarPrefs = (p) => setPrefs(prev => { const n = { ...prev, ...p }; guardarPrefs3D(n); return n; });

  const territoriosGJ = useMemo(() => poligonosGeoJSON(territorio ? [territorio] : [], territorio?.color || '#2563EB'), [territorio]);

  // Destino de "Cómo llegar": un punto dentro del territorio (su centro si cae adentro)
  const destino = useMemo(() => {
    const f = territoriosGJ.features[0];
    if (!f) return null;
    try {
      const c = turf.centroid(f);
      const p = turf.booleanPointInPolygon(c, f) ? c : turf.pointOnFeature(f);
      return p.geometry.coordinates; // [lng, lat]
    } catch { return null; }
  }, [territoriosGJ]);

  const casasBloques = useMemo(() => casasBloquesGeoJSON(casas), [casas]);
  const casasPuntos = useMemo(() => casasPuntosGeoJSON(casas), [casas]);
  const coordSel = casaSel ? coordsCasa(casaSel) : null;
  const seleccion = useMemo(
    () => (coordSel ? seleccionCasaGeoJSON(coordSel[0], coordSel[1]) : VACIO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordSel?.[0], coordSel?.[1]]
  );
  const rutaGJ = useMemo(() => (ruta
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: ruta.geometria, properties: {} }] }
    : VACIO), [ruta]);

  const datos = useMemo(() => ({
    territorios: territoriosGJ, manzanas: VACIO, 'casas-bloques': casasBloques, 'casas-puntos': casasPuntos,
    seleccion, ruta: rutaGJ, 'ruta-puntos': VACIO,
  }), [territoriosGJ, casasBloques, casasPuntos, seleccion, rutaGJ]);

  const casasRef = useRef(casas);
  useEffect(() => { casasRef.current = casas; });

  const alCrear = (map) => {
    activarHoverCasas(map);
    map.on('click', (e) => {
      const caja = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
      const capas = ['casas-3d', 'casas-punto'].filter(id => map.getLayer(id));
      const f = capas.length ? map.queryRenderedFeatures(caja, { layers: capas })[0] : null;
      setCasaSel(f ? casasRef.current.find(c => String(c.id) === String(f.properties.id)) || null : null);
    });
  };

  const { mapRef, listo, sinConexion } = useMapa3D(divRef, { prefs, oscuro, datos, alCrear, onFallo });

  // Alto del panel de abajo (móvil): el mapa encuadra por encima y el crédito sube
  useEffect(() => {
    const el = hojaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAltoHoja(window.innerWidth < 768 ? el.offsetHeight : 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const relleno = () => ({ top: 80, right: 70, left: window.innerWidth >= 768 ? 440 : 30, bottom: (altoHoja || 0) + 30 });

  // Encuadrar el territorio al abrir
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || encuadradoRef.current) return;
    const limites = limitesDe(territoriosGJ);
    if (!limites) return;
    encuadradoRef.current = true;
    map.fitBounds(limites, { padding: relleno(), maxZoom: 17, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, territoriosGJ, mapRef]);

  // Marcadores de la ruta: tu ubicación y el destino
  useEffect(() => {
    const map = mapRef.current;
    marcadoresRef.current.forEach(m => m.remove());
    marcadoresRef.current = [];
    if (!map || !listo || !ruta || !destino) return undefined;
    marcadoresRef.current = [
      new maplibregl.Marker({ element: marcador('m3d-ruta-origen') }).setLngLat(ruta.origen).addTo(map),
      new maplibregl.Marker({ element: marcador('m3d-ruta-destino'), anchor: 'bottom' }).setLngLat(destino).addTo(map),
    ];
    marcadoresRef.current[1].getElement().style.setProperty('--c', territorio?.color || '#2563EB');
    return () => { marcadoresRef.current.forEach(m => m.remove()); marcadoresRef.current = []; };
  }, [ruta, destino, listo, mapRef, territorio?.color]);

  const comoLlegar = async () => {
    if (!destino || buscando) return;
    setError('');
    setCasaSel(null);
    setBuscando(true);
    try {
      let origen;
      try {
        const pos = await pedirUbicacion();
        origen = [pos.coords.longitude, pos.coords.latitude];
      } catch {
        setError(t('No pudimos obtener tu ubicación. Revisa el permiso de ubicación del navegador.'));
        return;
      }
      let r;
      try { r = await buscarRuta(origen, destino); } catch {
        r = { geometria: { type: 'LineString', coordinates: [origen, destino] }, distancia: turf.distance(origen, destino, { units: 'meters' }), duracion: null, aproximada: true };
      }
      setRuta({ ...r, origen });
      const limites = limitesDe({ type: 'Feature', geometry: r.geometria, properties: {} });
      if (limites) mapRef.current?.fitBounds(limites, { padding: relleno(), maxZoom: 17, duration: 900 });
    } finally { setBuscando(false); }
  };

  const quitarRuta = () => {
    setRuta(null);
    const limites = limitesDe(territoriosGJ);
    if (limites) mapRef.current?.fitBounds(limites, { padding: relleno(), maxZoom: 17, duration: 700 });
  };

  const [dLng, dLat] = destino || [];
  const linkGoogle = destino ? `https://www.google.com/maps/dir/?api=1&destination=${dLat.toFixed(6)},${dLng.toFixed(6)}&travelmode=driving` : null;
  const linkWaze = destino ? `https://waze.com/ul?ll=${dLat.toFixed(6)},${dLng.toFixed(6)}&navigate=yes` : null;
  const conCoords = casas.filter(c => coordsCasa(c)).length;

  return (
    <div className="m3d-compartido" style={{ '--alto-hoja': `${altoHoja}px` }}>
      <div ref={divRef} className="m3d-canvas" />

      {/* Arriba: nombre del territorio */}
      <div className="m3d-compartido__top">
        <div className="m3d-titulo">
          <span className="m3d-titulo__icono" style={{ background: territorio?.color || '#2563EB', color: '#fff' }}><MapPinned size={17} /></span>
          <div className="min-w-0">
            <p className="m3d-titulo__sub">{t('Territorio Compartido')}</p>
            <p className="m3d-titulo__texto truncate">{territorio?.nombre || t('Territorio')}</p>
          </div>
        </div>
      </div>

      <BotonesMapa3D prefs={prefs} onCambiar={cambiarPrefs} oscuro={oscuro} />

      {sinConexion && (
        <div className="m3d-aviso" style={{ bottom: altoHoja + 12 }}>
          <span>{t('El mapa no cargó (sin conexión). Tus datos siguen disponibles.')}</span>
        </div>
      )}

      {/* Panel: ficha de casa o "Cómo llegar" */}
      <div ref={hojaRef} className="m3d-compartido__hoja">
        {casaSel ? (
          <div className="flex flex-col gap-2">
            <div className="m3d-fila justify-between">
              <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
                <Home size={16} className="shrink-0" style={{ color: STATUS_COLORS[casaSel.estado]?.hex || '#9CA3AF' }} />
                <span className="truncate">{casaSel.direccion || t('Casa')}</span>
              </h2>
              <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => setCasaSel(null)} aria-label={t('Cerrar')}><X size={16} /></button>
            </div>
            {casaSel.estado && (
              <span className="m3d-pill self-start" style={{ background: `${STATUS_COLORS[casaSel.estado]?.hex || '#9CA3AF'}22`, color: STATUS_COLORS[casaSel.estado]?.hex || '#475569' }}>
                {t(casaSel.estado)}
              </span>
            )}
            {casaSel.nombre_contacto && <p className="text-sm text-secondary m-0">{casaSel.nombre_contacto}</p>}
            {casaSel.notas && <p className="text-xs text-muted m-0" style={{ fontStyle: 'italic' }}>{casaSel.notas}</p>}
            {coordSel && (
              <div className="m3d-acciones m3d-acciones--wrap">
                <a className="m3d-accion" href={`https://www.google.com/maps/dir/?api=1&destination=${coordSel[1].toFixed(6)},${coordSel[0].toFixed(6)}`} target="_blank" rel="noopener noreferrer">
                  <Navigation size={15} /> {t('Cómo llegar')}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="m3d-fila justify-between">
              <h2 className="m3d-h2 m-0">{t('Cómo llegar')}</h2>
              <span className="text-xs text-muted">{t('{n} casas', { n: conCoords })}</span>
            </div>

            {ruta ? (
              <>
                <div className="m3d-compartido__ruta">
                  <Route size={18} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="m-0 font-extrabold">
                      {formatoDistancia(ruta.distancia)}
                      {ruta.duracion ? ` · ${formatoDuracion(ruta.duracion)}` : ''}
                    </p>
                    <p className="m-0 text-xs text-muted">
                      {ruta.aproximada ? t('Distancia en línea recta (no se pudo trazar la ruta)') : t('En coche, hasta el centro del territorio')}
                    </p>
                  </div>
                  <button type="button" className="m3d-btn-icono m3d-btn-icono--sm ml-auto" onClick={quitarRuta} aria-label={t('Quitar ruta')} title={t('Quitar ruta')}><X size={16} /></button>
                </div>
                <div className="m3d-acciones m3d-acciones--wrap">
                  <a className="m3d-accion m3d-accion--azul" href={linkGoogle} target="_blank" rel="noopener noreferrer">
                    <Navigation size={15} /> {t('Abrir en Google Maps')}
                  </a>
                  <a className="m3d-accion" href={linkWaze} target="_blank" rel="noopener noreferrer">
                    <Navigation size={15} /> {t('Abrir en Waze')}
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted m-0">{t('Traza la ruta desde donde estás hasta el territorio. Toca una casa para ver sus datos.')}</p>
                <div className="m3d-acciones m3d-acciones--wrap">
                  <button type="button" className="m3d-accion m3d-accion--azul" onClick={comoLlegar} disabled={buscando || !destino}>
                    {buscando ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />}
                    {buscando ? t('Buscando ruta...') : t('Ver ruta en el mapa')}
                  </button>
                  {linkGoogle && (
                    <a className="m3d-accion" href={linkGoogle} target="_blank" rel="noopener noreferrer">
                      <Navigation size={15} /> {t('Google Maps')}
                    </a>
                  )}
                </div>
              </>
            )}
            {error && <p className="text-xs m-0" style={{ color: '#EF4444' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedTerritory3D;
