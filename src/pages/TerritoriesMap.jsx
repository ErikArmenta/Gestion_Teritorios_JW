import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet-draw';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { STATUS_COLORS } from '../utils/constants';
import { Trash2, Pencil, X, Check } from 'lucide-react';

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

const TerritoriesMap = () => {
  const { territorios, casas, addTerritorio, updateTerritorio, deleteTerritorio, loading } = useData();
  const toast = useToast();

  const [newPolygonCoords, setNewPolygonCoords] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '', responsable: '', color: '#3B82F6' });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      setFormData({ nombre: '', descripcion: '', responsable: '', color: '#3B82F6' });
      setNewPolygonCoords(null);
      toast.success('Territorio creado correctamente');
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || err));
    }
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ nombre: t.nombre, descripcion: t.descripcion || '', responsable: t.responsable || '', color: t.color });
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
          <p className="hidden sm:block text-sm mt-0.5" style={{ color: '#475569' }}>
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
          <span key={label} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#94A3B8' }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: hex }} />
            {label}
          </span>
        ))}
      </div>

      {/* Map card */}
      <div className="card flex-1 min-h-0 p-0 overflow-hidden" style={{ minHeight: '420px' }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[420px] gap-3">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <p className="text-sm" style={{ color: '#475569' }}>Cargando mapa...</p>
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
            <GlobalMapFitter territorios={territorios} />
            <FeatureGroup>
              <CustomEditControl onCreated={handleDrawCreated} />
            </FeatureGroup>

            {/* Polígonos de territorios */}
            {territorios.map((t) => (
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
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9' }}
                        value={editForm.responsable}
                        onChange={e => setEditForm(f => ({ ...f, responsable: e.target.value }))}
                        placeholder="Responsable"
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
                    <div className="py-1" style={{ minWidth: 200 }}>
                      <h4 className="font-bold text-sm mb-1" style={{ color: t.color }}>{t.nombre}</h4>
                      {t.responsable && <p className="text-xs text-slate-300 mb-0.5"><strong>Responsable:</strong> {t.responsable}</p>}
                      {t.descripcion && <p className="text-xs text-slate-400 mb-1">{t.descripcion}</p>}
                      <p className="text-xs text-slate-500 mb-3">
                        {casas.filter(c => String(c.territorio_id) === String(t.id)).length} casas registradas
                      </p>
                      <div className="flex gap-2">
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
                      </div>
                    </div>
                  )}
                </Popup>
              </Polygon>
            ))}

            {/* Marcadores de casas */}
            <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
              {casas.map((c) => (
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
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        )}
      </div>

      {/* Modal nuevo territorio */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-[9999] p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in" style={{ borderRadius: '1.25rem' }}>
            <h3 className="text-lg font-bold mb-5">Nuevo Territorio</h3>
            <form onSubmit={handleSaveNew}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input required value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Zona Norte" />
              </div>
              <div className="form-group">
                <label className="form-label">Responsable *</label>
                <input required value={formData.responsable} onChange={e => setFormData(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre del hermano responsable" />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea rows={3} value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} placeholder="Notas sobre este territorio..." />
              </div>
              <div className="form-group">
                <label className="form-label">Color del polígono</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={formData.color} onChange={e => setFormData(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 p-1 rounded-xl cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.15)' }} />
                  <span className="text-sm" style={{ color: '#475569' }}>Color visible en el mapa</span>
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
          </div>
        </div>
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
