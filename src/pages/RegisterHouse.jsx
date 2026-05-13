import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import * as turf from '@turf/turf';
import { Locate, Upload, X } from 'lucide-react';
import { STATUS_OPTIONS, getStatusColor } from '../utils/constants';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const LocationMarker = ({ position, setPosition }) => {
  useMapEvents({ click(e) { setPosition(e.latlng); } });
  return position ? <Marker position={position} /> : null;
};

const MapCenterer = ({ territorioObj }) => {
  const map = useMap();
  useEffect(() => {
    if (territorioObj?.coordenadas?.length > 0) {
      map.fitBounds(L.latLngBounds(territorioObj.coordenadas), { padding: [20, 20], maxZoom: 16 });
    }
  }, [territorioObj, map]);
  return null;
};

const EMPTY_FORM = {
  territorio_id: '', direccion: '', estado: 'Pendiente',
  nombre_contacto: '', telefono: '',
  tiene_caso_especial: false, tipo_caso: '', detalles_caso: '', notas: '',
};

const RegisterHouse = () => {
  const { territorios, casas, addCasa, uploadPhoto } = useData();
  const toast = useToast();
  const photoInputRef = useRef(null);

  const [position, setPosition]     = useState({ lat: 31.7619, lng: -106.4850 });
  const [photoFile, setPhotoFile]   = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [locating, setLocating]     = useState(false);
  const [formData, setFormData]     = useState(EMPTY_FORM);

  // Genera preview al seleccionar foto
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const checkInPolygon = () => {
    if (!formData.territorio_id) return null;
    const territorio = territorios.find(t => String(t.id) === String(formData.territorio_id));
    if (!territorio?.coordenadas || territorio.coordenadas.length < 3) return null;
    try {
      const pt = turf.point([position.lng, position.lat]);
      let coords = territorio.coordenadas.map(c => [c[1], c[0]]);
      if (coords[0][0] !== coords.at(-1)[0] || coords[0][1] !== coords.at(-1)[1]) coords.push(coords[0]);
      return turf.booleanPointInPolygon(pt, turf.polygon([coords]));
    } catch { return false; }
  };

  const insideTerritory   = useMemo(() => checkInPolygon(), [position, formData.territorio_id, territorios]);
  const casasEnTerritorio = useMemo(() =>
    casas.filter(c => String(c.territorio_id) === String(formData.territorio_id)),
    [casas, formData.territorio_id]
  );
  const selectedTerritoryObj = territorios.find(t => String(t.id) === String(formData.territorio_id));

  const handleLocate = () => {
    if (!navigator.geolocation) { toast.warning('Tu navegador no soporta geolocalización'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success('Ubicación GPS obtenida');
      },
      () => {
        setLocating(false);
        toast.error('No se pudo obtener la ubicación. Verifica los permisos del navegador.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (insideTerritory === false) {
      // Usamos confirm propio — advertencia no destructiva
      const ok = window.confirm('La ubicación seleccionada NO está dentro del territorio. ¿Guardar de todos modos?');
      if (!ok) return;
    }

    setIsUploading(true);
    try {
      const territorio = territorios.find(t => String(t.id) === String(formData.territorio_id));
      const foto_url = photoFile ? await uploadPhoto(photoFile) : null;

      await addCasa({
        territorio_id:     parseInt(formData.territorio_id, 10),
        direccion:         formData.direccion,
        estado:            formData.estado,
        nombre_contacto:   formData.nombre_contacto,
        telefono:          formData.telefono,
        tiene_caso_especial: formData.tiene_caso_especial,
        tipo_caso:         formData.tipo_caso,
        detalles_caso:     formData.detalles_caso,
        notas:             formData.notas,
        territorio_nombre: territorio?.nombre || '',
        latitud:           position.lat,
        longitud:          position.lng,
        foto_url,
      });

      toast.success('Casa registrada exitosamente');
      setFormData(EMPTY_FORM);
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Registrar Nueva Casa</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* ── Formulario ── */}
        <div className="card">
          <h3 className="mb-4">Datos Generales</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Territorio *</label>
              <select required value={formData.territorio_id} onChange={e => setFormData(f => ({ ...f, territorio_id: e.target.value }))}>
                <option value="">Selecciona un territorio...</option>
                {territorios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Dirección Completa *</label>
              <input required value={formData.direccion} onChange={e => setFormData(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Calle Principal 123" />
            </div>

            <div className="form-group">
              <label className="form-label">Estado de Visita</label>
              <select value={formData.estado} onChange={e => setFormData(f => ({ ...f, estado: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <h3 className="border-t border-gray-100 pt-4 mt-2 mb-4">Residentes y Casos</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="form-group flex-1">
                <label className="form-label">Nombre del Contacto</label>
                <input value={formData.nombre_contacto} onChange={e => setFormData(f => ({ ...f, nombre_contacto: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">Teléfono</label>
                <input value={formData.telefono} onChange={e => setFormData(f => ({ ...f, telefono: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>

            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  className="w-auto accent-blue-500"
                  checked={formData.tiene_caso_especial}
                  onChange={e => setFormData(f => ({ ...f, tiene_caso_especial: e.target.checked }))}
                />
                Marcar como caso especial
              </label>
            </div>

            {formData.tiene_caso_especial && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-lg mb-4 space-y-3">
                <div className="form-group mb-0">
                  <label className="form-label">Tipo de Caso</label>
                  <select value={formData.tipo_caso} onChange={e => setFormData(f => ({ ...f, tipo_caso: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    <option value="Expulsado">Expulsado</option>
                    <option value="Censurado">Censurado</option>
                    <option value="Disciplinado">Disciplinado</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Detalles</label>
                  <textarea rows={2} value={formData.detalles_caso} onChange={e => setFormData(f => ({ ...f, detalles_caso: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notas Generales</label>
              <textarea rows={2} value={formData.notas} onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))} />
            </div>

            {/* Foto */}
            <h3 className="border-t border-gray-100 pt-4 mt-2 mb-4">Evidencia Fotográfica</h3>
            {photoPreview && (
              <div className="relative w-full h-40 mb-3 rounded-lg overflow-hidden border border-gray-200">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 p-4 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors text-sm text-gray-500">
              <Upload size={20} className="text-gray-400" />
              {photoFile ? photoFile.name : 'Toca para adjuntar foto (opcional)'}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhotoFile(e.target.files[0] || null)}
              />
            </label>

            <button type="submit" className="btn btn-primary w-full mt-5" disabled={isUploading}>
              {isUploading ? 'Guardando...' : 'Guardar Casa'}
            </button>
          </form>
        </div>

        {/* ── Mapa ── */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0">Geolocalización</h3>
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <Locate size={14} />
              {locating ? 'Obteniendo GPS...' : 'Usar mi ubicación'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">Haz clic en el mapa para posicionar la casa.</p>

          {insideTerritory === true && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg mb-3 text-xs">
              Ubicación correcta dentro del territorio seleccionado.
            </div>
          )}
          {insideTerritory === false && formData.territorio_id && (
            <div className="p-2.5 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg mb-3 text-xs">
              Ubicación fuera del territorio seleccionado. Puedes guardar de todos modos.
            </div>
          )}

          <div className="flex-1 rounded-lg overflow-hidden" style={{ minHeight: '380px' }}>
            <MapContainer center={[position.lat, position.lng]} zoom={14} style={{ height: '100%', width: '100%', minHeight: '380px' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationMarker position={position} setPosition={setPosition} />
              <MapCenterer territorioObj={selectedTerritoryObj} />
              {selectedTerritoryObj?.coordenadas && (
                <Polygon positions={selectedTerritoryObj.coordenadas} pathOptions={{ color: selectedTerritoryObj.color, fillOpacity: 0.15 }} />
              )}
              {casasEnTerritorio.map(c => (
                <CircleMarker
                  key={c.id}
                  center={[c.latitud, c.longitud]}
                  radius={6}
                  pathOptions={{ color: '#fff', fillColor: getStatusColor(c.estado), fillOpacity: 1, weight: 2 }}
                >
                  <Tooltip direction="top" offset={[0, -5]}>
                    <div style={{ fontSize: '11px' }}>
                      <strong>{c.direccion}</strong><br />
                      <span style={{ color: getStatusColor(c.estado) }}>{c.estado}</span>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterHouse;
