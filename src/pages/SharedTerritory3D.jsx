import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import { MapPinned, Navigation, X, Loader2, Route, Home, Flag, Users, Radio } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import usePresenciaCompartido, { VIGENCIA_MS } from '../hooks/usePresenciaCompartido';
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
// Solo consulta: el territorio, sus casas (toca una para ver sus datos), el punto de reunión (Migración 8,
// opcional), quién del grupo anda en el territorio en vivo (hooks/usePresenciaCompartido.js, nada se guarda)
// y "Cómo llegar": la ruta en coche de tu ubicación al punto de reunión (o al centro del territorio), dibujada en el mapa (OSRM de FOSSGIS,
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

// Punto de reunión: bandera + "Punto de reunión" (texto fijo de la app)
const marcadorReunion = () => {
  const el = marcador('m3d-reunion');
  el.innerHTML = '<span class="m3d-reunion__pin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></span>';
  const etq = document.createElement('span');
  etq.className = 'm3d-reunion__etq';
  etq.textContent = t('Punto de reunión');
  el.prepend(etq);
  return el;
};

// Persona del grupo: el nombre lo escribe cada quien → textContent (nunca innerHTML); color con style
const marcadorPersona = (nombre, color, yo = false) => {
  const el = marcador(`m3d-persona${yo ? ' m3d-persona--yo' : ''}`);
  el.style.setProperty('--c', color);
  const etq = document.createElement('span');
  etq.className = 'm3d-persona__etq';
  etq.textContent = nombre;
  const punto = document.createElement('span');
  punto.className = 'm3d-persona__punto';
  el.append(etq, punto);
  return el;
};

const haceCuanto = (ms) => {
  const min = Math.floor(ms / 60000);
  return min < 1 ? t('ahora') : t('hace {n} min', { n: min });
};

const NOMBRE_KEY = 'compartido_nombre';
const leerNombre = () => { try { return localStorage.getItem(NOMBRE_KEY) || ''; } catch { return ''; } };

const SharedTerritory3D = ({ compartidoId, territorio, casas, reunion, onFallo }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
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

  // En vivo: con sesión en este celular sale su nombre; si no, lo escribe la primera vez
  const [nombreLocal, setNombreLocal] = useState(leerNombre);
  const [pidiendoNombre, setPidiendoNombre] = useState(false);
  const nombre = user?.nombre || nombreLocal.trim();
  const presencia = usePresenciaCompartido(compartidoId, nombre);
  const { otros, compartiendo, miPos, llave } = presencia;
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id); }, []);
  const personasRef = useRef(new Map()); // llave → Marker
  const reunionRef = useRef(null);

  const cambiarPrefs = (p) => setPrefs(prev => { const n = { ...prev, ...p }; guardarPrefs3D(n); return n; });

  const territoriosGJ = useMemo(() => poligonosGeoJSON(territorio ? [territorio] : [], territorio?.color || '#2563EB'), [territorio]);

  // Destino de "Cómo llegar": el punto de reunión o un punto dentro del territorio (su centro si cae adentro)
  const destino = useMemo(() => {
    if (reunion) return [reunion.lng, reunion.lat];
    const f = territoriosGJ.features[0];
    if (!f) return null;
    try {
      const c = turf.centroid(f);
      const p = turf.booleanPointInPolygon(c, f) ? c : turf.pointOnFeature(f);
      return p.geometry.coordinates; // [lng, lat]
    } catch { return null; }
  }, [territoriosGJ, reunion]);

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
    const limites = limitesDe(reunion
      ? { type: 'FeatureCollection', features: [...territoriosGJ.features, { type: 'Feature', geometry: { type: 'Point', coordinates: [reunion.lng, reunion.lat] }, properties: {} }] }
      : territoriosGJ);
    if (!limites) return;
    encuadradoRef.current = true;
    map.fitBounds(limites, { padding: relleno(), maxZoom: 17, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, territoriosGJ, mapRef, reunion]);

  // Marcadores de la ruta: tu ubicación (si no estás compartiendo: ahí ya sale "Tú") y el destino
  // (si hay punto de reunión, ese ya tiene su bandera)
  const compartiendoUbic = presencia.compartiendo;
  useEffect(() => {
    const map = mapRef.current;
    marcadoresRef.current.forEach(m => m.remove());
    marcadoresRef.current = [];
    if (!map || !listo || !ruta || !destino) return undefined;
    if (!compartiendoUbic) {
      marcadoresRef.current.push(new maplibregl.Marker({ element: marcador('m3d-ruta-origen') }).setLngLat(ruta.origen).addTo(map));
    }
    if (!reunion) {
      const fin = new maplibregl.Marker({ element: marcador('m3d-ruta-destino'), anchor: 'bottom' }).setLngLat(destino).addTo(map);
      fin.getElement().style.setProperty('--c', territorio?.color || '#2563EB');
      marcadoresRef.current.push(fin);
    }
    return () => { marcadoresRef.current.forEach(m => m.remove()); marcadoresRef.current = []; };
  }, [ruta, destino, listo, mapRef, territorio?.color, reunion, compartiendoUbic]);

  // Punto de reunión (siempre visible)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || !reunion) return undefined;
    reunionRef.current = new maplibregl.Marker({ element: marcadorReunion(), anchor: 'bottom' })
      .setLngLat([reunion.lng, reunion.lat]).addTo(map);
    return () => { reunionRef.current?.remove(); reunionRef.current = null; };
  }, [listo, mapRef, reunion]);

  // Personas en vivo (los demás + yo si comparto). Se reutilizan los marcadores: solo se mueven.
  const personas = useMemo(() => {
    const lista = otros.map(o => ({ ...o, viejo: ahora - o.t > VIGENCIA_MS }));
    if (compartiendo && miPos) lista.push({ llave, nombre: t('Tú'), color: '#2563EB', lat: miPos.lat, lng: miPos.lng, t: ahora, yo: true });
    return lista;
  }, [otros, compartiendo, miPos, llave, ahora]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const vivos = new Set();
    personas.forEach(p => {
      vivos.add(p.llave);
      let m = personasRef.current.get(p.llave);
      if (!m) {
        m = new maplibregl.Marker({ element: marcadorPersona(p.nombre, p.color, p.yo), anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
        personasRef.current.set(p.llave, m);
      } else {
        m.setLngLat([p.lng, p.lat]);
        const etq = m.getElement().querySelector('.m3d-persona__etq');
        if (etq && etq.textContent !== p.nombre) etq.textContent = p.nombre;
      }
      m.getElement().classList.toggle('is-viejo', !!p.viejo);
    });
    personasRef.current.forEach((m, k) => { if (!vivos.has(k)) { m.remove(); personasRef.current.delete(k); } });
  }, [personas, listo, mapRef]);

  useEffect(() => () => { personasRef.current.forEach(m => m.remove()); personasRef.current.clear(); }, []);

  const volarA = (p) => mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 17), duration: 900 });

  const alternarCompartir = () => {
    if (compartiendo) { presencia.dejarDeCompartir(); return; }
    if (!nombre) { setPidiendoNombre(true); return; }
    presencia.empezarACompartir();
  };
  const confirmarNombre = (e) => {
    e.preventDefault();
    const n = nombreLocal.trim().slice(0, 40);
    if (!n) return;
    try { localStorage.setItem(NOMBRE_KEY, n); } catch { /* sin storage */ }
    setNombreLocal(n);
    setPidiendoNombre(false);
    presencia.empezarACompartir();
  };

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

            {reunion && (
              <button type="button" className="m3d-compartido__reunion" onClick={() => volarA(reunion)}>
                <Flag size={16} className="shrink-0" />
                <span className="min-w-0 text-left">
                  <strong className="block">{t('Punto de reunión')}</strong>
                  {reunion.nota && <span className="block text-xs text-secondary truncate">{reunion.nota}</span>}
                </span>
              </button>
            )}

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
                      {ruta.aproximada ? t('Distancia en línea recta (no se pudo trazar la ruta)') : reunion ? t('En coche, hasta el punto de reunión') : t('En coche, hasta el centro del territorio')}
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

            {/* ── En vivo: quién anda en el territorio ── */}
            <div className="m3d-compartido__vivo">
              <div className="m3d-fila justify-between">
                <h3 className="m3d-h2 m-0 flex items-center gap-2" style={{ fontSize: 15 }}>
                  <Users size={16} /> {t('En el territorio')}
                </h3>
                <span className="text-xs text-muted">{t('{n} en el mapa', { n: personas.length })}</span>
              </div>

              {pidiendoNombre ? (
                <form className="flex gap-2" onSubmit={confirmarNombre}>
                  <input
                    autoFocus
                    value={nombreLocal}
                    onChange={e => setNombreLocal(e.target.value)}
                    maxLength={40}
                    placeholder={t('Tu nombre')}
                    className="flex-1 min-w-0"
                  />
                  <button type="submit" className="m3d-accion m3d-accion--azul" disabled={!nombreLocal.trim()}>{t('Listo')}</button>
                </form>
              ) : (
                <button
                  type="button"
                  className={`m3d-accion m3d-compartido__vivo-btn${compartiendo ? ' is-activo' : ''}`}
                  onClick={alternarCompartir}
                >
                  <Radio size={15} />
                  {compartiendo ? t('Dejar de compartir mi ubicación') : t('Compartir mi ubicación')}
                </button>
              )}

              {personas.length > 0 && (
                <div className="m3d-compartido__personas">
                  {personas.map(p => (
                    <button key={p.llave} type="button" className={`m3d-compartido__persona${p.viejo ? ' is-viejo' : ''}`} onClick={() => volarA(p)}>
                      <span className="m3d-compartido__persona-punto" style={{ background: p.color }} />
                      <span className="truncate">{p.nombre}</span>
                      {!p.yo && <span className="text-muted" style={{ fontSize: 10 }}>{haceCuanto(ahora - p.t)}</span>}
                    </button>
                  ))}
                </div>
              )}
              {presencia.error && <p className="text-xs m-0" style={{ color: '#EF4444' }}>{presencia.error}</p>}
              <p className="text-xs text-muted m-0">
                {t('Solo te ven si lo activas, y solo mientras tengas esta página abierta con la pantalla encendida. No se guarda.')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedTerritory3D;
