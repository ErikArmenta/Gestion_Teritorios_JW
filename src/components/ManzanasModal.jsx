import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import ModalOverlay from './ModalOverlay';
import ConfirmModal from './ConfirmModal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { X, Trash2, PenLine } from 'lucide-react';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const getSugerencia = (territorio, manzanas) => {
  const base = territorio.numero || territorio.nombre || '';
  const count = manzanas.filter(m => String(m.territorio_id) === String(territorio.id)).length;
  const letra = LETTERS[count] || String(count + 1);
  return `${base}${letra}`;
};

const DrawControl = ({ onCreated }) => {
  const map = useMap();

  useEffect(() => {
    const drawControl = new L.Control.Draw({
      draw: {
        polyline: false,
        polygon: true,
        circle: false,
        circlemarker: false,
        marker: false,
        rectangle: false,
      },
      edit: false,
    });
    map.addControl(drawControl);

    const handler = (e) => onCreated(e);
    map.on(L.Draw.Event.CREATED, handler);

    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED, handler);
    };
  }, [map, onCreated]);

  return null;
};

const MapFitter = ({ coordenadas }) => {
  const map = useMap();
  useEffect(() => {
    if (!coordenadas?.length) return;
    try {
      map.fitBounds(L.latLngBounds(coordenadas), { padding: [20, 20] });
    } catch {}
  }, [map, coordenadas]);
  return null;
};

const ManzanasModal = ({ territorio, onClose }) => {
  const { manzanas, addManzana, deleteManzana } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const [drawing, setDrawing] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canEdit = user?.rol === 'Admin' || user?.rol === 'Super Admin';

  const misManzanas = manzanas.filter(
    m => String(m.territorio_id) === String(territorio.id)
  );

  const center = (() => {
    if (!territorio.coordenadas?.length) return [20.967, -89.623];
    const lats = territorio.coordenadas.map(c => c[0]);
    const lngs = territorio.coordenadas.map(c => c[1]);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  })();

  const handleDrawCreated = useCallback((e) => {
    const layer = e.layer;
    const coords = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    setPendingCoords(coords);
    setNombre(getSugerencia(territorio, misManzanas));
    setDrawing(false);
  }, [territorio, misManzanas]);

  const handleGuardar = async () => {
    if (!nombre.trim() || !pendingCoords) return;
    setSaving(true);
    try {
      await addManzana({
        territorio_id: territorio.id,
        nombre: nombre.trim(),
        coordenadas: pendingCoords,
      });
      setPendingCoords(null);
      setNombre('');
      toast.success('Manzana agregada');
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteManzana(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Manzana eliminada');
    } catch (err) {
      toast.error('Error al eliminar: ' + (err.message || err));
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <ModalOverlay onClose={onClose} size="large">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold" style={{ color: '#0F172A' }}>
            Manzanas —{' '}
            <span style={{ color: territorio.color || '#2563EB' }}>{territorio.nombre}</span>
            {territorio.numero && (
              <span className="ml-2 text-sm font-normal" style={{ color: '#64748B' }}>
                #{territorio.numero}
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="btn btn-outline p-1.5"
            style={{ borderRadius: '8px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de manzanas */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>
            Manzanas existentes
            {misManzanas.length > 0 && (
              <span
                className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}
              >
                {misManzanas.length}
              </span>
            )}
          </h4>

          {misManzanas.length === 0 ? (
            <p className="text-sm" style={{ color: '#64748B' }}>
              Sin manzanas.{canEdit ? ' Dibuja la primera usando el mapa abajo.' : ''}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {misManzanas.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{
                    background: 'rgba(37,99,235,0.05)',
                    border: '1px solid rgba(37,99,235,0.12)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: m.color || territorio.color || '#2563EB' }}
                    />
                    <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                      {m.nombre}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="btn btn-outline text-xs py-1.5 px-3 flex items-center gap-1"
                      style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección de dibujo (solo Admin/Super Admin) */}
        {canEdit && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                {pendingCoords ? 'Confirmar nueva manzana' : 'Dibujar nueva manzana'}
              </h4>
              {!pendingCoords && !drawing && (
                <button
                  onClick={() => setDrawing(true)}
                  className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  <PenLine size={14} />
                  Dibujar manzana
                </button>
              )}
              {drawing && (
                <button
                  onClick={() => setDrawing(false)}
                  className="btn btn-outline text-xs py-1.5 px-3"
                >
                  Cancelar
                </button>
              )}
            </div>

            {drawing && (
              <p className="text-xs mb-2" style={{ color: '#64748B' }}>
                Usa el control de dibujo en el mapa para trazar el polígono de la manzana.
              </p>
            )}

            {/* Mini-mapa */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ height: '280px', border: '1px solid rgba(0,0,0,0.1)' }}
            >
              <MapContainer
                center={center}
                zoom={16}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <MapFitter coordenadas={territorio.coordenadas} />

                {/* Polígono del territorio padre */}
                {territorio.coordenadas?.length > 0 && (
                  <Polygon
                    positions={territorio.coordenadas}
                    pathOptions={{
                      color: territorio.color || '#2563EB',
                      fillColor: territorio.color || '#2563EB',
                      fillOpacity: 0.1,
                      weight: 2,
                    }}
                  />
                )}

                {/* Manzanas ya guardadas */}
                {misManzanas.map(m => (
                  <Polygon
                    key={m.id}
                    positions={m.coordenadas}
                    pathOptions={{
                      color: m.color || territorio.color || '#2563EB',
                      fillColor: m.color || territorio.color || '#2563EB',
                      fillOpacity: 0.2,
                      weight: 2,
                      dashArray: '6 4',
                    }}
                  />
                ))}

                {/* Polígono pendiente de confirmar */}
                {pendingCoords && (
                  <Polygon
                    positions={pendingCoords}
                    pathOptions={{
                      color: '#16A34A',
                      fillColor: '#16A34A',
                      fillOpacity: 0.25,
                      weight: 2,
                      dashArray: '6 4',
                    }}
                  />
                )}

                {/* Control de dibujo — solo cuando está activo */}
                {drawing && <DrawControl onCreated={handleDrawCreated} />}
              </MapContainer>
            </div>

            {/* Formulario de nombre tras dibujar */}
            {pendingCoords && (
              <div
                className="mt-3 p-4 rounded-xl"
                style={{
                  background: 'rgba(22,163,74,0.05)',
                  border: '1px solid rgba(22,163,74,0.2)',
                }}
              >
                <p className="text-xs mb-2" style={{ color: '#64748B' }}>
                  Polígono dibujado. Asigna un nombre a la manzana:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: 4A, 4B, Manzana Norte..."
                    className="flex-1"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleGuardar(); }}
                  />
                  <button
                    onClick={handleGuardar}
                    disabled={saving || !nombre.trim()}
                    className="btn btn-primary px-4"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => { setPendingCoords(null); setNombre(''); }}
                    className="btn btn-outline px-3"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </ModalOverlay>

      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar la manzana "${deleteTarget.nombre}"?`}
          detail="Esta acción no se puede deshacer."
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
};

export default ManzanasModal;
