import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet-draw';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import { STATUS_COLORS, getStatusColor } from '../utils/constants';
import { Trash2, Pencil, X, Check, Search, Navigation } from 'lucide-react';
import EditHouseModal from '../components/EditHouseModal';
import AsignacionesModal from '../components/AsignacionesModal';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

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

const GlobalMapFitter = ({ territorios }) => {
  const map = useMap();
  useEffect(() => {
    if (!territorios?.length) return;
    const all = territorios.flatMap(t => t.coordenadas || []);
    if (!all.length) return;
    try { map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 16 }); } catch {}
  }, [territorios, map]);
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
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>Sin historial de visitas</p>
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

const ADMIN_ROLES = ['Super Admin', 'Admin Principal', 'Anciano'];

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
        left: '12px',
        zIndex: 999,
        width: '288px',
        maxWidth: 'calc(100vw - 2rem)',
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
          placeholder="Buscar dirección, contacto..."
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
  const { territorios, casas, asignaciones, addTerritorio, updateTerritorio, deleteTerritorio, loading } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const [newPolygonCoords, setNewPolygonCoords] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '', color: '#3B82F6' });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editCasa, setEditCasa] = useState(null);
  const [gestionarTerritorio, setGestionarTerritorio] = useState(null);
  const [filtroMisTerr, setFiltroMisTerr] = useState(false);
  const filtroInitialized = useRef(false);
  const [rutaActiva, setRutaActiva] = useState(null); // { territorioId, casasOrdenadas, polylinePoints }

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

  const territoriosFiltrados = filtroMisTerr
    ? territorios.filter(t =>
        asignaciones.some(
          a => String(a.territorio_id) === String(t.id) && String(a.usuario_id) === String(user?.id) && a.activa
        )
      )
    : territorios;

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
      await addTerritorio({ ...formData, coordenadas: newPolygonCoords });
      setShowNewModal(false);
      setFormData({ nombre: '', descripcion: '', color: '#3B82F6' });
      setNewPolygonCoords(null);
      toast.success('Territorio creado correctamente');
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || err));
    }
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ nombre: t.nombre, descripcion: t.descripcion || '', color: t.color });
  };

  const handleSaveEdit = async () => {
    try {
      await updateTerritorio(editingId, editForm);
      setEditingId(null);
      toast.success('Territorio actualizado');
    } catch (err) {
      toast.error('Error al actualizar: ' + (err.message || err));
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

  const handleDelete = async () => {
    try {
      await deleteTerritorio(deleteTarget.id);
      toast.success(`Territorio "${deleteTarget.nombre}" eliminado`);
    } catch (err) {
      toast.error('Error al eliminar: ' + (err.message || err));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3 mb-3 sm:mb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold heading-gradient">Mapa Principal y Territorios</h1>
          <p className="hidden sm:block text-sm mt-0.5 text-secondary">
            Dibuja polígonos para crear territorios. Clic en un polígono para editar o eliminar.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#3B82F6' }} />
            {territorios.length} territorios
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
            {casas.length} casas
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 px-0.5">
        {Object.entries(STATUS_COLORS).map(([label, { hex }]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: hex }} />
            {label}
          </span>
        ))}
      </div>

      {/* Map card */}
      <div className="flex-1 min-h-0 relative" style={{ minHeight: '420px' }}>
        {/* Toggle Ver todos / Mis territorios */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 1000, display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setFiltroMisTerr(false)}
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
            Ver todos
          </button>
          <button
            onClick={() => setFiltroMisTerr(true)}
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
            Mis territorios
          </button>
        </div>
        <div className="card h-full p-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[420px] gap-3">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <p className="text-sm text-secondary">Cargando mapa...</p>
          </div>
        ) : (
          <MapContainer center={[31.7619, -106.4850]} zoom={13} style={{ height: '100%', width: '100%', minHeight: '420px' }}>
            {/* Capa base oscura sin labels */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
            {/* Capa de labels con efecto neón brillante */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
              className="neon-labels"
            />
            <GlobalMapFitter territorios={territoriosFiltrados} />
            <MapSearch
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              busquedaDebounced={busquedaDebounced}
              resultadosBusqueda={resultadosBusqueda}
            />
            <FeatureGroup>
              <CustomEditControl onCreated={handleDrawCreated} />
            </FeatureGroup>

            {/* Polígonos de territorios */}
            {territoriosFiltrados.map((t) => (
              <Polygon
                key={t.id}
                positions={t.coordenadas}
                pathOptions={{ color: t.color, fillColor: t.color, fillOpacity: 0.25, weight: 2.5 }}
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle({ fillOpacity: 0.45, weight: 4 }),
                  mouseout:  (e) => e.target.setStyle({ fillOpacity: 0.25, weight: 2.5 }),
                }}
              >
                <Popup minWidth={220} maxWidth={280}>
                  {editingId === t.id ? (
                    <div className="py-1 space-y-2" style={{ minWidth: 210 }}>
                      <p className="font-bold text-sm mb-2" style={{ color: '#F1F5F9' }}>Editar territorio</p>
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        value={editForm.nombre}
                        onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        placeholder="Nombre"
                      />
                      <textarea
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        rows={2}
                        value={editForm.descripcion}
                        onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                        placeholder="Descripción"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs" style={{ color: '#94A3B8' }}>Color:</label>
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
                          <X size={11} /> Cancelar
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

                      {/* Asignados */}
                      {(() => {
                        const activasT = asignaciones.filter(a => String(a.territorio_id) === String(t.id) && a.activa);
                        return (
                          <div className="mb-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-semibold" style={{ color: '#CBD5E1' }}>Asignados:</span>
                              <span
                                className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: activasT.length > 0 ? 'rgba(37,99,235,0.2)' : 'rgba(100,116,139,0.2)', color: activasT.length > 0 ? '#93C5FD' : '#94A3B8' }}
                              >
                                {activasT.length} publicador{activasT.length !== 1 ? 'es' : ''} asignado{activasT.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {activasT.length === 0 ? (
                              <p className="text-xs" style={{ color: '#64748B' }}>Sin asignaciones</p>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {activasT.map(a => (
                                  <p key={a.id} className="text-xs" style={{ color: '#94A3B8' }}>
                                    {a.app_usuarios?.nombre || `Usuario ${a.usuario_id}`}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <p className="text-xs text-slate-500 mb-3">
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
                            Gestionar Asignaciones
                          </button>
                        )}
                        {casas.some(c => String(c.territorio_id) === String(t.id) && c.estado === 'Pendiente') && (
                          <button
                            onClick={() => iniciarRuta(t.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium w-full mt-1"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}
                          >
                            <Navigation size={11} /> Ruta de Visitas
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Popup>
              </Polygon>
            ))}

            {/* Marcadores de casas */}
            <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
              {casasFiltradas.map((c) => (
                <Marker key={c.id} position={[c.latitud, c.longitud]} icon={createHouseIcon(c.estado, c._offline)}>
                  <Popup className="ficha-tecnica" maxWidth={300} minWidth={240}>
                    <div className="min-w-[220px] max-w-[280px]">
                      {/* Header con color del estado */}
                      <div style={{ background: STATUS_COLORS[c.estado]?.hex || '#6B7280', padding: '10px 14px', margin: '-12px -12px 12px -12px', borderRadius: '12px 12px 0 0' }}>
                        <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {c.estado}
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
                        <div><strong style={{ color: '#CBD5E1' }}>Territorio:</strong> {c.territorio_nombre}</div>
                        {c.nombre_contacto && <div><strong style={{ color: '#CBD5E1' }}>Contacto:</strong> {c.nombre_contacto}</div>}
                        {c.telefono && (
                          <div>
                            <strong style={{ color: '#CBD5E1' }}>Tel:</strong>{' '}
                            <a href={`tel:${c.telefono}`} style={{ color: '#60A5FA', textDecoration: 'underline' }}>{c.telefono}</a>
                          </div>
                        )}
                        {c.notas && <div><strong style={{ color: '#CBD5E1' }}>Notas:</strong> {c.notas}</div>}
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
          </MapContainer>
        )}
        </div>

        {/* Panel lateral ruta de visitas */}
        {rutaActiva && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              height: '100%',
              width: '256px',
              zIndex: 1000,
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
                  Ruta de Visitas
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
                Abrir en Google Maps
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
                Cancelar ruta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nuevo territorio */}
      {showNewModal && (
        <ModalOverlay onClose={() => { setShowNewModal(false); setNewPolygonCoords(null); }} size="default">
          <h3 className="text-lg font-bold mb-5">Nuevo Territorio</h3>
          <form onSubmit={handleSaveNew}>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input required value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Zona Norte" />
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea rows={3} value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} placeholder="Notas sobre este territorio..." />
            </div>
            <div className="form-group">
              <label className="form-label">Color del polígono</label>
              <div className="flex items-center gap-3">
                <input type="color" value={formData.color} onChange={e => setFormData(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 p-1 rounded-xl cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.15)' }} />
                <span className="text-sm text-secondary">Color visible en el mapa</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => { setShowNewModal(false); setNewPolygonCoords(null); }}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary flex-1">
                Guardar Territorio
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

      {/* Modal edición de casa */}
      {editCasa && (
        <EditHouseModal
          casa={editCasa}
          onClose={() => setEditCasa(null)}
          onSaved={() => setEditCasa(null)}
        />
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
