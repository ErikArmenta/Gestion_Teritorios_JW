import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, Polygon, Polyline, Marker, Popup, FeatureGroup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import TerritoryProgressPanel from '../components/TerritoryProgressPanel';
import { getTerritoryProgress, indexarHistorial, PROGRESO } from '../utils/territoryProgress';
import { useGrupos } from '../context/GruposContext';
import TerritorioTrabajo from '../components/TerritorioTrabajo';
// "t" se usa para territorios en los .map, por eso la función de traducción es tx
import { t as tx } from '../i18n';
import 'leaflet-draw';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import ZoomAwareLabel from '../components/ZoomAwareLabel';
import { STATUS_COLORS, getStatusColor } from '../utils/constants';
import { Trash2, Pencil, X, Check, Search, Navigation, Share2, Copy } from 'lucide-react';
import { supabase } from '../supabaseClient';
import EditHouseModal from '../components/EditHouseModal';
import AsignacionesModal from '../components/AsignacionesModal';
import ManzanasModal from '../components/ManzanasModal';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import DarkTileLayers from '../components/DarkTileLayers';
import LocateButton from '../components/LocateButton';

const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const CustomEditControl = ({ onCreated }) => {
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

const GlobalMapFitter = ({ territorios, fitKey }) => {
  const map = useMap();
  useEffect(() => {
    if (!territorios?.length) {
      console.log('GlobalMapFitter: no territorios to fit');
      return;
    }
    const all = territorios.flatMap(t => t.coordenadas || []);
    if (!all.length) return;
    try {
      const bounds = L.latLngBounds(all);
      if (bounds.isValid()) {
        setTimeout(() => {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: true });
        }, 50);
      }
    } catch (err) {
      console.error('GlobalMapFitter error:', err);
    }
  }, [territorios, map, fitKey]);
  return null;
};

const createHouseIcon = (estado, isOffline = false) => {
  const color = STATUS_COLORS[estado]?.hex || '#9CA3AF';
  const offlineIndicator = isOffline
    ? `<circle cx="24" cy="6" r="5" fill="#F59E0B" stroke="white" stroke-width="1.5"/>
       <text x="24" y="9" text-anchor="middle" font-size="7" font-weight="bold" fill="white">⏳</text>`
    : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" width="28" height="32">
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
      <g filter="url(#shadow)">
        <path d="M16 2 L3 14 L6 14 L6 30 L26 30 L26 14 L29 14 Z"
              fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"
              ${isOffline ? 'opacity="0.7" stroke-dasharray="4 2"' : ''}/>
        <rect x="12" y="19" width="8" height="11" rx="1" fill="white" opacity="0.35"/>
      </g>
      ${offlineIndicator}
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'house-marker-icon',
    iconSize: [28, 32],
    iconAnchor: [14, 32],
    popupAnchor: [0, -30],
  });
};

// Cluster de casas dibujado como casa, con barra de estados debajo (estilos en index.css)
const createClusterIcon = (cluster) => {
  const markers = cluster.getAllChildMarkers();
  const count = markers.length;
  const width = count < 10 ? 48 : count < 50 ? 56 : 64;
  const height = Math.round(width * 1.08);

  const porEstado = {};
  markers.forEach(m => {
    const estado = m.options.estado || 'Pendiente';
    porEstado[estado] = (porEstado[estado] || 0) + 1;
  });
  const segmentos = Object.entries(porEstado)
    .map(([estado, n]) => `<span style="flex:${n};background:${STATUS_COLORS[estado]?.hex || '#9CA3AF'}"></span>`)
    .join('');

  const fontSize = count < 100 ? 15 : 12;
  return L.divIcon({
    className: 'house-cluster',
    html: `
      <svg viewBox="0 0 56 60" width="${width}" height="${height}" aria-hidden="true">
        <defs>
          <linearGradient id="hc-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1E3A8A"/>
          </linearGradient>
        </defs>
        <rect x="37" y="7" width="7" height="14" rx="1.5" fill="#1E40AF" stroke="#fff" stroke-width="2"/>
        <path d="M28 3 L3.5 24.5 Q2 26 4 27 H9 V52 Q9 56 13 56 H43 Q47 56 47 52 V27 H52 Q54 26 52.5 24.5 Z"
              fill="url(#hc-body)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M28 8 L10 24 H46 Z" fill="#fff" opacity="0.14"/>
        <text x="28" y="${count < 100 ? 46 : 45}" text-anchor="middle" font-family="Inter, system-ui, sans-serif"
              font-size="${fontSize}" font-weight="800" fill="#fff">${count}</text>
      </svg>
      <div class="house-cluster__bar">${segmentos}</div>`,
    iconSize: [width, height + 8],
    iconAnchor: [width / 2, (height + 8) / 2],
  });
};

// Zoom "de detalle": desde aquí se separan las casas y aparecen las etiquetas.
// Por debajo, el cluster "absorbe" casas y etiquetas.
const DETAIL_ZOOM = 17;

// Clic en cluster: vuela hasta sus casas con zoom de detalle → se ven todas las casas y etiquetas
const handleClusterClick = (e) => {
  const map = e.layer._map;
  const bounds = e.layer.getBounds();
  const fit = map.getBoundsZoom(bounds, false, L.point(60, 60));
  map.flyTo(bounds.getCenter(), Math.min(18, Math.max(DETAIL_ZOOM, fit)), { duration: 0.9 });
};

const CasaHistorialSection = ({ casaId }) => {
  const { fetchHistorialCasa } = useData();
  const [open, setOpen] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatDateCompact = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const handleToggle = async () => {
    if (!fetched) {
      setLoading(true);
      try {
        const data = await fetchHistorialCasa(casaId);
        setHistorial((data || []).slice(0, 5));
      } catch {
        setHistorial([]);
      } finally {
        setLoading(false);
        setFetched(true);
      }
    }
    setOpen(o => !o);
  };

  return (
    <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
      <button
        onClick={handleToggle}
        style={{ fontSize: '11px', color: '#60A5FA', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <span style={{ fontSize: '9px' }}>{open ? '▲' : '▼'}</span>
        {loading ? 'Cargando historial...' : (open ? 'Ocultar historial' : 'Ver historial')}
      </button>
      {open && !loading && (
        <div style={{ marginTop: '6px' }}>
          {historial.length === 0 ? (
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>{tx('Sin historial de visitas')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {historial.map(h => (
                <div key={h.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: getStatusColor(h.estado_nuevo), flexShrink: 0, marginTop: '3px' }} />
                  <div style={{ fontSize: '10px', lineHeight: '1.4' }}>
                    <span style={{ color: '#64748B' }}>{formatDateCompact(h.created_at)} — </span>
                    <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{h.usuario_nombre || 'Usuario'}</span>
                    <span style={{ color: '#64748B' }}>: {h.estado_anterior} → </span>
                    <span style={{ color: getStatusColor(h.estado_nuevo), fontWeight: 600 }}>{h.estado_nuevo}</span>
                    {h.notas && (
                      <span style={{ display: 'block', color: '#64748B', fontStyle: 'italic' }}>{h.notas}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ADMIN_ROLES = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

const ZoomProvider = ({ children }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return children(zoom);
};

const MapSearch = ({ busqueda, setBusqueda, busquedaDebounced, resultadosBusqueda }) => {
  const map = useMap();

  const handleSelect = (casa) => {
    if (casa.latitud && casa.longitud) {
      map.flyTo([Number(casa.latitud), Number(casa.longitud)], 18);
    }
    setBusqueda('');
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '56px',
        zIndex: 1001,
        width: '288px',
        maxWidth: 'calc(100% - 68px)',
        pointerEvents: 'auto',
      }}
    >
      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          padding: '8px 12px',
        }}
      >
        <Search size={15} style={{ color: '#64748B', flexShrink: 0 }} />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder={tx('Buscar dirección, contacto...')}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: '#0F172A',
            minWidth: 0,
          }}
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <X size={14} style={{ color: '#94A3B8' }} />
          </button>
        )}
      </div>

      {/* Dropdown resultados */}
      {busquedaDebounced && resultadosBusqueda.length > 0 && (
        <div
          style={{
            marginTop: '4px',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}
        >
          {resultadosBusqueda.map((casa, idx) => (
            <button
              key={casa.id}
              onClick={() => handleSelect(casa)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderBottom: idx < resultadosBusqueda.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                display: 'block',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {casa.direccion}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {casa.territorio_nombre}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: '9999px',
                    flexShrink: 0,
                    background: (STATUS_COLORS[casa.estado]?.hex || '#9CA3AF') + '22',
                    color: STATUS_COLORS[casa.estado]?.hex || '#64748B',
                  }}
                >
                  {casa.estado}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sin resultados */}
      {busquedaDebounced && resultadosBusqueda.length === 0 && (
        <div
          style={{
            marginTop: '4px',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            padding: '12px',
            fontSize: '12px',
            color: '#94A3B8',
            textAlign: 'center',
          }}
        >
          Sin resultados para "{busquedaDebounced}"
        </div>
      )}
    </div>
  );
};

const distEuclidiana = (a, b) =>
  Math.sqrt((a.latitud - b.latitud) ** 2 + (a.longitud - b.longitud) ** 2);

const calcularRutaNN = (casasPendientes, startLat = null, startLng = null) => {
  if (!casasPendientes.length) return [];
  const pending = [...casasPendientes];
  const ordered = [];

  if (startLat !== null && startLng !== null) {
    const startPoint = { latitud: startLat, longitud: startLng };
    let minDist = Infinity, minIdx = 0;
    pending.forEach((c, i) => {
      const d = distEuclidiana(startPoint, c);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    ordered.push(pending[minIdx]);
    pending.splice(minIdx, 1);
  } else {
    ordered.push(pending.shift());
  }

  while (pending.length > 0) {
    const current = ordered[ordered.length - 1];
    let minDist = Infinity, minIdx = 0;
    pending.forEach((c, i) => {
      const d = distEuclidiana(current, c);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    ordered.push(pending[minIdx]);
    pending.splice(minIdx, 1);
  }

  return ordered;
};

const TerritoriesMap = () => {
  const { territorios, casas, asignaciones, usuarios, addTerritorio, updateTerritorio, deleteTerritorio, loading, manzanas, addManzana, deleteManzana } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const [newPolygonCoords, setNewPolygonCoords] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({ numero: '', nombre: '', descripcion: '', color: '#3B82F6', responsable: '', congregacion_id_override: '' });
  const [congregaciones, setCongregaciones] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editCasa, setEditCasa] = useState(null);
  const [gestionarTerritorio, setGestionarTerritorio] = useState(null);
  const [filtroMisTerr, setFiltroMisTerr] = useState(false);
  const [modoProgreso, setModoProgreso] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [fitCounter, setFitCounter] = useState(0);
  const filtroInitialized = useRef(false);
  const [rutaActiva, setRutaActiva] = useState(null); // { territorioId, casasOrdenadas, polylinePoints }
  const [compartirModal, setCompartirModal] = useState(null); // null | { territorioId, link }
  const [compartirLoading, setCompartirLoading] = useState(false);
  const [manzanasModalTerritorio, setManzanasModalTerritorio] = useState(null);

  // Búsqueda en mapa
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);

  useEffect(() => {
    if (filtroInitialized.current) return;
    if (asignaciones.length === 0) return;
    filtroInitialized.current = true;
    if (user?.rol === 'Publicador') {
      const tieneAsignaciones = asignaciones.some(
        a => String(a.usuario_id) === String(user.id) && a.activa
      );
      setFiltroMisTerr(tieneAsignaciones);
    }
  }, [asignaciones, user]);

  useEffect(() => {
    if (user?.rol === 'Super Admin' && !user?.congregacion_id) {
      supabase.from('congregaciones').select('id, nombre').then(({ data }) => {
        if (data) setCongregaciones(data);
      });
    }
  }, [user?.rol, user?.congregacion_id]);

  const { disponible: gruposDisponibles, grupos, trabajos, historial, miGrupo } = useGrupos();

  // "Mis territorios" = asignados a mí o que mi grupo está trabajando ahora
  const territoriosFiltrados = filtroMisTerr
    ? territorios.filter(t =>
        asignaciones.some(
          a => String(a.territorio_id) === String(t.id) && String(a.usuario_id) === String(user?.id) && a.activa
        )
        || (miGrupo && trabajos.some(
          tr => String(tr.territorio_id) === String(t.id) && String(tr.grupo_id) === String(miGrupo.id) && tr.estado === 'en_progreso'
        ))
      )
    : territorios;

  // Progreso de cada territorio (trabajo de grupos + % casas visitadas)
  const progresoPorTerritorio = useMemo(() => {
    const ctx = { disponible: !!gruposDisponibles, trabajos, grupos, historialIdx: indexarHistorial(historial) };
    const map = {};
    territorios.forEach(t => { map[t.id] = getTerritoryProgress(t, casas, ctx); });
    return map;
  }, [territorios, casas, gruposDisponibles, trabajos, grupos, historial]);

  const territoryPathOptions = (t) => {
    if (!modoProgreso) return { color: t.color, fillColor: t.color, fillOpacity: 0.25, weight: 2.5, dashArray: null };
    const p = progresoPorTerritorio[t.id];
    const color = PROGRESO[p?.estado]?.color || '#94A3B8';
    return {
      color,
      fillColor: color,
      fillOpacity: 0.12 + ((p?.pct || 0) / 100) * 0.4,
      weight: 3,
      dashArray: p?.estado === 'sin_trabajar' ? '6 6' : null,
    };
  };

  const volarATerritorio = (t) => {
    if (!mapInstance || !t.coordenadas?.length) return;
    mapInstance.flyToBounds(L.polygon(t.coordenadas).getBounds(), { padding: [40, 40], maxZoom: 18, duration: 1 });
  };

  const casasFiltradas = filtroMisTerr
    ? casas.filter(c => territoriosFiltrados.some(t => String(t.id) === String(c.territorio_id)))
    : casas;

  // Debounce búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setBusquedaDebounced(busqueda.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Filtrar resultados según busquedaDebounced
  useEffect(() => {
    if (!busquedaDebounced) {
      setResultadosBusqueda([]);
      return;
    }
    const q = busquedaDebounced.toLowerCase();
    const encontrados = casasFiltradas.filter(c =>
      (c.direccion || '').toLowerCase().includes(q) ||
      (c.nombre_contacto || '').toLowerCase().includes(q) ||
      (c.territorio_nombre || '').toLowerCase().includes(q)
    ).slice(0, 8);
    setResultadosBusqueda(encontrados);
  }, [busquedaDebounced, casasFiltradas]);

  const handleDrawCreated = useCallback((e) => {
    const { layerType, layer } = e;
    if (layerType === 'polygon' || layerType === 'rectangle') {
      setNewPolygonCoords(layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]));
      setShowNewModal(true);
      layer.remove();
    }
  }, []);

  const handleSaveNew = async (e) => {
    e.preventDefault();
    if (!newPolygonCoords) return;
    try {
      const payload = { ...formData, coordenadas: newPolygonCoords };
      if (formData.congregacion_id_override) payload.congregacion_id = formData.congregacion_id_override;
      delete payload.congregacion_id_override;
      await addTerritorio(payload);
      setShowNewModal(false);
      setFormData({ numero: '', nombre: '', descripcion: '', color: '#3B82F6', responsable: '', congregacion_id_override: '' });
      setNewPolygonCoords(null);
      toast.success(tx('Territorio creado correctamente'));
    } catch (err) {
      toast.error(tx('Error al guardar: ') + (err.message || err));
    }
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ numero: t.numero || '', nombre: t.nombre, descripcion: t.descripcion || '', color: t.color, responsable: t.responsable || '' });
  };

  const handleSaveEdit = async () => {
    try {
      await updateTerritorio(editingId, editForm);
      setEditingId(null);
      toast.success(tx('Territorio actualizado'));
    } catch (err) {
      toast.error(tx('Error al actualizar: ') + (err.message || err));
    }
  };

  const confirmDelete = (t) => {
    const count = casas.filter(c => String(c.territorio_id) === String(t.id)).length;
    setDeleteTarget({ id: t.id, nombre: t.nombre, count });
  };

  const iniciarRuta = (territorioId) => {
    const pendientes = casas.filter(
      c => String(c.territorio_id) === String(territorioId) && c.estado === 'Pendiente'
        && c.latitud && c.longitud
    );
    if (!pendientes.length) return;

    let startLat = null, startLng = null;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const ordenadas = calcularRutaNN(pendientes, pos.coords.latitude, pos.coords.longitude);
          setRutaActiva({
            territorioId,
            casasOrdenadas: ordenadas,
            polylinePoints: ordenadas.map(c => [Number(c.latitud), Number(c.longitud)]),
          });
        },
        () => {
          const ordenadas = calcularRutaNN(pendientes);
          setRutaActiva({
            territorioId,
            casasOrdenadas: ordenadas,
            polylinePoints: ordenadas.map(c => [Number(c.latitud), Number(c.longitud)]),
          });
        },
        { timeout: 3000 }
      );
    } else {
      const ordenadas = calcularRutaNN(pendientes);
      setRutaActiva({
        territorioId,
        casasOrdenadas: ordenadas,
        polylinePoints: ordenadas.map(c => [Number(c.latitud), Number(c.longitud)]),
      });
    }
  };

  const generarUrlGoogleMaps = (casasOrdenadas) => {
    if (!casasOrdenadas.length) return '#';
    const waypoints = casasOrdenadas.map(c => `${Number(c.latitud).toFixed(6)},${Number(c.longitud).toFixed(6)}`);
    return `https://www.google.com/maps/dir/${waypoints.join('/')}`;
  };

  const handleCompartir = async (t) => {
    setCompartirLoading(true);
    try {
      const { data, error } = await supabase
        .from('territorio_compartidos')
        .insert({
          territorio_id: t.id,
          creado_por: user.id,
          expira_en: new Date(Date.now() + 86400000).toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      const link = window.location.origin + '/shared/' + data.id;
      setCompartirModal({ territorioId: t.id, territorioNombre: t.nombre, link });
    } catch (err) {
      toast.error(tx('Error al compartir: ') + (err.message || err));
    } finally {
      setCompartirLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTerritorio(deleteTarget.id);
      toast.success(tx('Territorio "{nombre}" eliminado', { nombre: deleteTarget.nombre }));
    } catch (err) {
      toast.error(tx('Error al eliminar: ') + (err.message || err));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3 mb-3 sm:mb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold heading-gradient">{tx('Mapa Principal y Territorios')}</h1>
          <p className="hidden sm:block text-sm mt-0.5 text-secondary">
            {tx('Dibuja polígonos para crear territorios. Clic en un polígono para editar o eliminar.')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#3B82F6' }} />
            {tx('{n} territorios', { n: territorios.length })}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
            {tx('{n} casas', { n: casas.length })}
          </div>
        </div>
      </div>

      {/* Leyenda (casas, o estados de territorio en modo progreso) */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 px-0.5">
        {(modoProgreso
          ? Object.values(PROGRESO).map(p => [p.label, p.color])
          : Object.entries(STATUS_COLORS).map(([label, { hex }]) => [label, hex])
        ).map(([label, hex]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-muted">
            {/* Anillo para que los colores oscuros (No tocar) se vean en modo oscuro */}
            <span className="legend-dot w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
            {tx(label)}
          </span>
        ))}
      </div>

      {/* Map card */}
      {/* isolate: los controles flotantes (z-index 1000+) no pueden quedar sobre menús/modales de la app */}
      <div className="flex-1 min-h-0 relative isolate flex flex-col" style={{ minHeight: '420px' }}>
        {/* Toggle Ver todos / Mis territorios */}
        <div className="map-filter-toggle" style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 1000, display: 'flex', gap: '4px' }}>
          <button
            onClick={() => { setFiltroMisTerr(false); setFitCounter(c => c + 1); }}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: filtroMisTerr ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
              background: filtroMisTerr ? 'rgba(15,23,42,0.85)' : '#2563EB',
              color: filtroMisTerr ? '#94A3B8' : '#fff',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
            }}
          >
            {tx('Ver todos')}
          </button>
          <button
            onClick={() => { setFiltroMisTerr(true); setFitCounter(c => c + 1); }}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: filtroMisTerr ? '1px solid transparent' : '1px solid rgba(255,255,255,0.15)',
              background: filtroMisTerr ? '#2563EB' : 'rgba(15,23,42,0.85)',
              color: filtroMisTerr ? '#fff' : '#94A3B8',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
            }}
          >
            {tx('Mis territorios')}
          </button>
          <button
            onClick={() => setModoProgreso(v => !v)}
            title={tx('Colorear territorios según su progreso')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: modoProgreso ? '1px solid transparent' : '1px solid rgba(255,255,255,0.15)',
              background: modoProgreso ? '#10B981' : 'rgba(15,23,42,0.85)',
              color: modoProgreso ? '#fff' : '#94A3B8',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
            }}
          >
            {tx('Progreso')}
          </button>
        </div>
        <div className="card flex-1 min-h-0 p-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[420px] gap-3">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <p className="text-sm text-secondary">{tx('Cargando mapa...')}</p>
          </div>
        ) : (
          <MapContainer ref={setMapInstance} center={[31.7619, -106.4850]} zoom={13} style={{ height: '100%', width: '100%', minHeight: '420px' }}>
            <DarkTileLayers />
            <GlobalMapFitter territorios={territoriosFiltrados} fitKey={fitCounter} />
            <MapSearch
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              busquedaDebounced={busquedaDebounced}
              resultadosBusqueda={resultadosBusqueda}
            />
            <FeatureGroup>
              <CustomEditControl onCreated={handleDrawCreated} />
            </FeatureGroup>

            <ZoomProvider>{(currentZoom) => (<>
            {/* Polígonos de territorios y sus manzanas */}
            {territoriosFiltrados.map((t) => {
              const manzanasTerr = manzanas.filter(m => String(m.territorio_id) === String(t.id));
              return (
              <React.Fragment key={t.id}>
              <Polygon
                positions={t.coordenadas}
                pathOptions={territoryPathOptions(t)}
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle({ fillOpacity: territoryPathOptions(t).fillOpacity + 0.2, weight: 4 }),
                  mouseout:  (e) => e.target.setStyle(territoryPathOptions(t)),
                }}
              >
                <Popup minWidth={220} maxWidth={280}>
                  {editingId === t.id ? (
                    <div className="py-1 space-y-2" style={{ minWidth: 210 }}>
                      <p className="font-bold text-sm mb-2" style={{ color: '#F1F5F9' }}>{tx('Editar territorio')}</p>
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        value={editForm.numero || ''}
                        onChange={e => setEditForm(f => ({ ...f, numero: e.target.value }))}
                        placeholder={tx('Número (ej: 1, T-3)')}
                      />
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        value={editForm.nombre}
                        onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        placeholder={tx('Nombre')}
                      />
                      <textarea
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        rows={2}
                        value={editForm.descripcion}
                        onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                        placeholder={tx('Descripción')}
                      />
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        value={editForm.responsable || ''}
                        onChange={e => setEditForm(f => ({ ...f, responsable: e.target.value }))}
                        placeholder={tx('Responsable')}
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs" style={{ color: '#94A3B8' }}>{tx('Color:')}</label>
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                          className="w-8 h-6 p-0.5 rounded cursor-pointer"
                          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 bg-slate-700/50 font-medium"
                        >
                          <X size={11} /> {tx('Cancelar')}
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium"
                        >
                          <Check size={11} /> Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-1" style={{ minWidth: 210 }}>
                      <h4 className="font-bold text-sm mb-1" style={{ color: t.color }}>{t.nombre}</h4>
                      {t.descripcion && <p className="text-xs text-slate-400 mb-2">{t.descripcion}</p>}

                      {/* Progreso + grupo de predicación */}
                      <TerritorioTrabajo territorio={t} progreso={progresoPorTerritorio[t.id]} />

                      {/* Asignados */}
                      {(() => {
                        const activasT = asignaciones.filter(a => String(a.territorio_id) === String(t.id) && a.activa);
                        return (
                          <div className="mb-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-semibold" style={{ color: '#CBD5E1' }}>{tx('Asignados:')}</span>
                              <span
                                className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: activasT.length > 0 ? 'rgba(37,99,235,0.2)' : 'rgba(100,116,139,0.2)', color: activasT.length > 0 ? '#93C5FD' : '#94A3B8' }}
                              >
                                {activasT.length} publicador{activasT.length !== 1 ? 'es' : ''} asignado{activasT.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {activasT.length === 0 ? (
                              <p className="text-xs" style={{ color: '#64748B' }}>{tx('Sin asignaciones')}</p>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {activasT.map(a => (
                                  <p key={a.id} className="text-xs" style={{ color: '#94A3B8' }}>
                                    {a.app_usuarios?.nombre || usuarios.find(u => String(u.id) === String(a.usuario_id))?.nombre || `Usuario ${a.usuario_id}`}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {t.responsable && (
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                          <span style={{ color: '#CBD5E1' }}>{tx('Responsable:')}</span> {t.responsable}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mb-1">
                        {casas.filter(c => String(c.territorio_id) === String(t.id)).length} casas registradas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEdit(t)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                        >
                          <Pencil size={11} /> Editar
                        </button>
                        <button
                          onClick={() => confirmDelete(t)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors font-medium"
                        >
                          <Trash2 size={11} /> Eliminar
                        </button>
                        {ADMIN_ROLES.includes(user?.rol) && (
                          <button
                            onClick={() => setGestionarTerritorio(t)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                            style={{ background: 'rgba(37,99,235,0.15)', color: '#93C5FD', border: '1px solid rgba(37,99,235,0.3)' }}
                          >
                            {tx('Gestionar Asignaciones')}
                          </button>
                        )}
                        {ADMIN_ROLES.includes(user?.rol) && (
                          <button
                            onClick={() => setManzanasModalTerritorio(t)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)' }}
                          >
                            {tx('Gestionar manzanas')}
                          </button>
                        )}
                        {casas.some(c => String(c.territorio_id) === String(t.id) && c.estado === 'Pendiente') && (
                          <button
                            onClick={() => iniciarRuta(t.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium w-full mt-1"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}
                          >
                            <Navigation size={11} /> {tx('Ruta de Visitas')}
                          </button>
                        )}
                        {ADMIN_ROLES.includes(user?.rol) && (
                          <button
                            onClick={() => handleCompartir(t)}
                            disabled={compartirLoading}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium w-full mt-1"
                            style={{ background: 'rgba(124,58,237,0.15)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.3)', opacity: compartirLoading ? 0.6 : 1, cursor: compartirLoading ? 'not-allowed' : 'pointer' }}
                          >
                            <Share2 size={11} /> {compartirLoading ? 'Generando...' : 'Compartir'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Popup>
              </Polygon>
              <ZoomAwareLabel coordenadas={t.coordenadas} numero={t.numero} nombre={t.nombre} color={t.color} zoom={currentZoom} minZoom={DETAIL_ZOOM} progreso={progresoPorTerritorio[t.id]} />
              {manzanasTerr.map(m => (
                <React.Fragment key={`manzana-${m.id}`}>
                <Polygon
                  positions={m.coordenadas}
                  pathOptions={{
                    color: m.color || t.color,
                    fillColor: m.color || t.color,
                    fillOpacity: 0.15,
                    weight: 2,
                    dashArray: '6 4',
                  }}
                />
                <ZoomAwareLabel coordenadas={m.coordenadas} numero={m.nombre} nombre={m.nombre} color={t.color} isManzana={true} zoom={currentZoom} />
                </React.Fragment>
              ))}
              </React.Fragment>
              );
            })}

            {/* Marcadores de casas */}
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={100}
              disableClusteringAtZoom={DETAIL_ZOOM}
              iconCreateFunction={createClusterIcon}
              zoomToBoundsOnClick={false}
              showCoverageOnHover={false}
              onClick={handleClusterClick}
            >
              {casasFiltradas.map((c) => (
                <Marker key={c.id} position={[c.latitud, c.longitud]} icon={createHouseIcon(c.estado, c._offline)} estado={c.estado}>
                  <Popup className="ficha-tecnica" maxWidth={300} minWidth={240}>
                    <div className="min-w-[220px] max-w-[280px]">
                      {/* Header con color del estado */}
                      <div style={{ background: STATUS_COLORS[c.estado]?.hex || '#6B7280', padding: '10px 14px', margin: '-12px -12px 12px -12px', borderRadius: '12px 12px 0 0' }}>
                        <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {tx(c.estado)}
                        </span>
                      </div>

                      {/* Foto */}
                      {c.foto_url && (
                        <div style={{ width: '100%', height: '130px', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                          <img src={c.foto_url} alt="Casa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}

                      {/* Dirección */}
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '10px' }}>{c.direccion}</h4>

                      {/* Datos en grid */}
                      <div style={{ display: 'grid', gap: '6px', fontSize: '12px', color: '#94A3B8' }}>
                        <div><strong style={{ color: '#CBD5E1' }}>{tx('Territorio:')}</strong> {c.territorio_nombre}</div>
                        {c.manzana_id && (() => {
                          const manz = manzanas.find(m => m.id === c.manzana_id);
                          return manz ? (
                            <div><strong style={{ color: '#CBD5E1' }}>{tx('Manzana:')}</strong> {manz.nombre}</div>
                          ) : null;
                        })()}
                        {c.nombre_contacto && <div><strong style={{ color: '#CBD5E1' }}>{tx('Contacto:')}</strong> {c.nombre_contacto}</div>}
                        {c.telefono && (
                          <div>
                            <strong style={{ color: '#CBD5E1' }}>{tx('Tel:')}</strong>{' '}
                            <a href={`tel:${c.telefono}`} style={{ color: '#60A5FA', textDecoration: 'underline' }}>{c.telefono}</a>
                          </div>
                        )}
                        {c.notas && <div><strong style={{ color: '#CBD5E1' }}>{tx('Notas:')}</strong> {c.notas}</div>}
                        {c.audio_url && (
                          <div style={{ marginTop: '8px' }}>
                            <strong style={{ color: '#CBD5E1' }}>{tx('Nota de voz:')}</strong>
                            <audio
                              controls
                              src={c.audio_url}
                              style={{ width: '100%', marginTop: '4px' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <div style={{ color: '#64748B', fontSize: '10px', marginTop: '4px' }}>
                          {Number(c.latitud).toFixed(6)}, {Number(c.longitud).toFixed(6)}
                        </div>
                      </div>

                      {/* Caso especial */}
                      {c.tiene_caso_especial && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(239,68,68,0.15)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '11px', color: '#FCA5A5' }}>
                          <strong>Caso especial ({c.tipo_caso}):</strong> {c.detalles_caso}
                        </div>
                      )}

                      {/* Badge offline */}
                      {c._offline && (
                        <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(245,158,11,0.2)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', fontSize: '10px', color: '#FCD34D', fontWeight: 600 }}>
                          ⏳ Pendiente de sincronizar
                        </div>
                      )}

                      {/* Botón Editar */}
                      <button
                        onClick={() => setEditCasa(c)}
                        className="btn btn-outline py-1 px-2 text-xs flex items-center gap-1 mt-2"
                      >
                        <Pencil size={12} /> Editar
                      </button>

                      {/* Historial de visitas colapsable */}
                      <CasaHistorialSection casaId={c.id} />
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>

            {/* Ruta de visitas — polyline */}
            {rutaActiva && rutaActiva.polylinePoints.length > 1 && (
              <Polyline
                positions={rutaActiva.polylinePoints}
                pathOptions={{ color: '#2563EB', dashArray: '6 4', weight: 3, opacity: 0.85 }}
              />
            )}
            </>)}</ZoomProvider>
            <LocateButton />
          </MapContainer>
        )}
        </div>

        {/* Aviso: "Mis territorios" vacío */}
        {!loading && filtroMisTerr && territoriosFiltrados.length === 0 && (
          <div className="map-empty-notice">
            <p className="font-bold text-sm" style={{ color: '#F1F5F9' }}>{tx('No tienes territorios asignados')}</p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
              {miGrupo ? tx('Tu grupo ({grupo}) no está trabajando ningún territorio ahora.', { grupo: miGrupo.nombre }) : tx('Pide que te asignen un territorio o que te agreguen a un grupo.')}
            </p>
          </div>
        )}

        {/* Progreso de territorios: botón flotante + panel sobre el mapa */}
        {!loading && (
          <TerritoryProgressPanel
            territorios={territoriosFiltrados}
            progreso={progresoPorTerritorio}
            onSelect={(t) => { setModoProgreso(true); volarATerritorio(t); }}
          />
        )}

        {/* Panel lateral ruta de visitas */}
        {rutaActiva && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              height: '100%',
              width: '256px',
              maxWidth: '85%',
              zIndex: 1002,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
              borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                background: 'rgba(37,99,235,0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={15} style={{ color: '#2563EB' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {tx('Ruta de Visitas')}
                </span>
              </div>
              <button
                onClick={() => setRutaActiva(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
              >
                <X size={16} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {/* Lista numerada */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', margin: '0 0 10px 0' }}>
                {rutaActiva.casasOrdenadas.length} casa{rutaActiva.casasOrdenadas.length !== 1 ? 's' : ''} pendiente{rutaActiva.casasOrdenadas.length !== 1 ? 's' : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rutaActiva.casasOrdenadas.map((casa, idx) => (
                  <div
                    key={casa.id}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#2563EB',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {casa.direccion}
                      </p>
                      {casa.nombre_contacto && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          {casa.nombre_contacto}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Botón Google Maps */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
              <a
                href={generarUrlGoogleMaps(rutaActiva.casasOrdenadas)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  marginBottom: '8px',
                }}
              >
                <Navigation size={13} />
                {tx('Abrir en Google Maps')}
              </a>
              <button
                onClick={() => setRutaActiva(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
                {tx('Cancelar ruta')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nuevo territorio */}
      {showNewModal && (
        <ModalOverlay onClose={() => { setShowNewModal(false); setNewPolygonCoords(null); }} size="default">
          <h3 className="text-lg font-bold mb-5">{tx('Nuevo Territorio')}</h3>
          <form onSubmit={handleSaveNew}>
            <div className="form-group">
              <label className="form-label">{tx('Número del territorio')}</label>
              <input value={formData.numero} onChange={e => setFormData(f => ({ ...f, numero: e.target.value }))} placeholder={tx('Ej: 1, 2, T-3 (opcional)')} />
            </div>
            <div className="form-group">
              <label className="form-label">{tx('Nombre *')}</label>
              <input required value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))} placeholder={tx('Ej: Zona Norte')} />
            </div>
            <div className="form-group">
              <label className="form-label">{tx('Descripción')}</label>
              <textarea rows={3} value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} placeholder="Notas sobre este territorio..." />
            </div>
            <div className="form-group">
              <label className="form-label">{tx('Responsable')}</label>
              <input value={formData.responsable} onChange={e => setFormData(f => ({ ...f, responsable: e.target.value }))} placeholder={tx('Nombre del responsable')} />
            </div>
            {user?.rol === 'Super Admin' && !user?.congregacion_id && (
              <div className="form-group">
                <label className="form-label">{tx('Congregación *')}</label>
                <select required value={formData.congregacion_id_override} onChange={e => setFormData(f => ({ ...f, congregacion_id_override: e.target.value }))}>
                  <option value="">{tx('Seleccionar...')}</option>
                  {congregaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{tx('Color del polígono')}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={formData.color} onChange={e => setFormData(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 p-1 rounded-xl cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.15)' }} />
                <span className="text-sm text-secondary">{tx('Color visible en el mapa')}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => { setShowNewModal(false); setNewPolygonCoords(null); }}>
                {tx('Cancelar')}
              </button>
              <button type="submit" className="btn btn-primary flex-1">
                {tx('Guardar Territorio')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* Modal gestionar asignaciones */}
      {gestionarTerritorio && (
        <AsignacionesModal
          territorio={gestionarTerritorio}
          onClose={() => setGestionarTerritorio(null)}
        />
      )}

      {manzanasModalTerritorio && (
        <ManzanasModal
          territorio={manzanasModalTerritorio}
          onClose={() => setManzanasModalTerritorio(null)}
        />
      )}

      {/* Modal edición de casa */}
      {editCasa && (
        <EditHouseModal
          casa={editCasa}
          onClose={() => setEditCasa(null)}
          onSaved={() => setEditCasa(null)}
        />
      )}

      {/* Modal compartir territorio */}
      {compartirModal && (
        <ModalOverlay onClose={() => setCompartirModal(null)} size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Share2 size={18} style={{ color: '#7C3AED' }} />
            <h3 className="text-lg font-bold">{tx('Compartir Territorio')}</h3>
          </div>
          <p className="text-sm text-secondary mb-4">
            {compartirModal.territorioNombre}
          </p>
          <div className="form-group">
            <label className="form-label">{tx('Enlace de acceso')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                readOnly
                value={compartirModal.link}
                style={{ flex: 1, fontSize: '12px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'text' }}
                onFocus={e => e.target.select()}
              />
              <button
                className="btn btn-outline"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', fontSize: '13px' }}
                onClick={() => {
                  navigator.clipboard.writeText(compartirModal.link);
                  toast.success(tx('Enlace copiado al portapapeles'));
                }}
              >
                <Copy size={13} /> Copiar
              </button>
            </div>
          </div>
          <p className="text-xs text-muted mt-2 mb-5">
            {tx('Este enlace expira en 24 horas.')}
          </p>
          <div className="flex gap-3">
            <button
              className="btn btn-outline flex-1"
              onClick={() => setCompartirModal(null)}
            >
              {tx('Cerrar')}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent('Territorio compartido: ' + compartirModal.link)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex-1"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}
            >
              <Share2 size={14} /> WhatsApp
            </a>
          </div>
        </ModalOverlay>
      )}

      {/* Modal confirmar eliminación */}
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar el territorio "${deleteTarget.nombre}"?`}
          detail={deleteTarget.count > 0
            ? `También se eliminarán las ${deleteTarget.count} casas registradas en este territorio.`
            : 'Este territorio no tiene casas registradas.'}
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default TerritoriesMap;
