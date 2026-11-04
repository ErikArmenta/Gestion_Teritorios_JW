import React, { useState, useMemo, useEffect, useRef, lazy } from 'react';
import { useData } from '../context/DataContext';
import ElegirVista from '../components/Vista3D';
import { MapContainer, Marker, useMapEvents, Polygon, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import * as turf from '@turf/turf';
import { Upload, X, MapPin, Camera, Mic, Square, Trash2, Box } from 'lucide-react';
import { STATUS_OPTIONS, getStatusColor } from '../utils/constants';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import useGuardarCasa from '../hooks/useGuardarCasa';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import DarkTileLayers from '../components/DarkTileLayers';
import LocateButton from '../components/LocateButton';
import { t } from '../i18n';

L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const LocationMarker = ({ position, setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const latlng = e.target.getLatLng();
          setPosition(latlng);
        },
      }}
    />
  );
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
  territorio_id: '', manzana_id: '', direccion: '', estado: 'Pendiente',
  nombre_contacto: '', telefono: '',
  tiene_caso_especial: false, tipo_caso: '', detalles_caso: '', notas: '',
};

// Vista clásica (formulario + mapa Leaflet): escritorio, o en móvil si se elige / si no hay WebGL2
const RegisterHouseClasica = ({ onVista3D }) => {
  const { territorios, casas, manzanas } = useData();
  const { guardarCasa, isUploading } = useGuardarCasa();
  const photoInputRef = useRef(null);

  const [position, setPosition]       = useState({ lat: 31.7619, lng: -106.4850 });
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [formData, setFormData]       = useState(EMPTY_FORM);
  const [gpsPermission, setGpsPermission] = useState('prompt'); // 'granted' | 'denied' | 'prompt'

  const { isRecording, audioBlob, audioUrl, recordingTimeFormatted, startRecording, stopRecording, clearRecording } = useVoiceRecorder();

  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setGpsPermission(result.state);
        result.onchange = () => setGpsPermission(result.state);
      }).catch(() => {});
    }
  }, []);

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
  const manzanasDelTerritorio = useMemo(() =>
    manzanas.filter(m => String(m.territorio_id) === String(formData.territorio_id)),
    [manzanas, formData.territorio_id]
  );


  const handleSubmit = async (e) => {
    e.preventDefault();

    if (insideTerritory === false) {
      const seguir = window.confirm(t('La ubicación seleccionada NO está dentro del territorio. ¿Guardar de todos modos?'));
      if (!seguir) return;
    }

    // Mismo guardado que la vista 3D (foto, nota de voz, cola offline): hooks/useGuardarCasa.js
    const ok = await guardarCasa({ formData, position, photoFile, audioBlob });
    if (ok) {
      setFormData(EMPTY_FORM);
      setPhotoFile(null);
      clearRecording();
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-page-in">
      <div className="mb-5 sm:mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">{t('Registrar Nueva Casa')}</h1>
          <p className="text-sm mt-0.5 text-secondary">{t('Ubica y documenta el punto en el territorio')}</p>
        </div>
        {onVista3D && (
          <button type="button" onClick={onVista3D} className="btn btn-outline shrink-0 flex items-center gap-1.5 text-sm">
            <Box size={16} /> {t('Mapa 3D')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7">
        {/* ── Formulario ── */}
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0" style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>1</div>
            <h3 className="text-base font-bold text-primary">{t('Datos Generales')}</h3>
            <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('Territorio *')}</label>
              <select required value={formData.territorio_id} onChange={e => setFormData(f => ({ ...f, territorio_id: e.target.value, manzana_id: '' }))}>
                <option value="">{t('Selecciona un territorio...')}</option>
                {territorios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            {/* Manzana (opcional, solo si el territorio tiene manzanas) */}
            {manzanasDelTerritorio.length > 0 && (
              <div className="form-group">
                <label className="form-label">{t('Manzana (opcional)')}</label>
                <select
                  value={formData.manzana_id}
                  onChange={e => setFormData(f => ({ ...f, manzana_id: e.target.value }))}
                >
                  <option value="">{t('Sin manzana específica')}</option>
                  {manzanasDelTerritorio.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('Dirección Completa *')}</label>
              <input required value={formData.direccion} onChange={e => setFormData(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Calle Principal 123" />
            </div>

            <div className="form-group">
              <label className="form-label">{t('Estado de Visita')}</label>
              <select value={formData.estado} onChange={e => setFormData(f => ({ ...f, estado: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-4 mt-2 mb-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0" style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>2</div>
              <h3 className="text-sm font-bold text-primary">{t('Residentes y Casos')}</h3>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="form-group flex-1">
                <label className="form-label">{t('Nombre del Contacto')}</label>
                <input value={formData.nombre_contacto} onChange={e => setFormData(f => ({ ...f, nombre_contacto: e.target.value }))} placeholder={t('Opcional')} />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">{t('Teléfono')}</label>
                <input value={formData.telefono} onChange={e => setFormData(f => ({ ...f, telefono: e.target.value }))} placeholder={t('Opcional')} type="tel" />
              </div>
            </div>

            <div className="form-group flex justify-center">
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none font-medium text-secondary">
                <input
                  type="checkbox"
                  className="w-auto accent-blue-500"
                  checked={formData.tiene_caso_especial}
                  onChange={e => setFormData(f => ({ ...f, tiene_caso_especial: e.target.checked }))}
                />
                {t('Marcar como caso especial')}
              </label>
            </div>

            {formData.tiene_caso_especial && (
              <div className="p-4 rounded-xl mb-4 space-y-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="form-group mb-0">
                  <label className="form-label">{t('Tipo de Caso')}</label>
                  <select value={formData.tipo_caso} onChange={e => setFormData(f => ({ ...f, tipo_caso: e.target.value }))}>
                    <option value="">{t('Seleccionar...')}</option>
                    <option value="Expulsado">{t('Expulsado')}</option>
                    <option value="Censurado">{t('Censurado')}</option>
                    <option value="Disciplinado">{t('Disciplinado')}</option>
                    <option value="Otro">{t('Otro')}</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t('Detalles')}</label>
                  <textarea rows={2} value={formData.detalles_caso} onChange={e => setFormData(f => ({ ...f, detalles_caso: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('Notas Generales')}</label>
              <textarea rows={2} value={formData.notas} onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))} />
            </div>

            {/* Nota de Voz */}
            <div className="flex items-center gap-3 pt-4 mt-2 mb-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0" style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>4</div>
              <h3 className="text-sm font-bold text-primary">{t('Nota de Voz')}</h3>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            <div className="flex flex-col items-center gap-3 mb-2">
              {!audioUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold transition-all shadow-md"
                    style={{ background: isRecording ? '#DC2626' : '#EF4444' }}
                  >
                    {isRecording ? <Square size={20} fill="white" /> : <Mic size={22} />}
                  </button>
                  {isRecording ? (
                    <span className="text-xs font-mono font-bold" style={{ color: '#DC2626' }}>
                      Grabando... {recordingTimeFormatted}
                    </span>
                  ) : (
                    <span className="text-xs text-secondary">{t('Mantén para grabar una nota de voz')}</span>
                  )}
                </div>
              ) : (
                <div className="w-full space-y-2">
                  <audio controls src={audioUrl} className="w-full" style={{ height: '36px' }} />
                  <button
                    type="button"
                    onClick={clearRecording}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.05)' }}
                  >
                    <Trash2 size={12} /> Eliminar nota de voz
                  </button>
                </div>
              )}
            </div>

            {/* Foto */}
            <div className="flex items-center gap-3 pt-4 mt-2 mb-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0" style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>3</div>
              <h3 className="text-sm font-bold text-primary">{t('Evidencia Fotográfica')}</h3>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            {photoPreview && (
              <div className="relative w-full h-40 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="flex gap-3">
              {/* Botón para tomar foto con cámara */}
              <label className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-colors text-sm hover:bg-blue-50/50"
                     style={{ border: '2px dashed rgba(37,99,235,0.3)', color: '#2563EB' }}>
                <Camera size={22} />
                <span className="font-medium text-xs">{t('Tomar Foto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhotoFile(e.target.files[0] || null)}
                />
              </label>

              {/* Botón para seleccionar de galería */}
              <label className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-colors text-sm hover:bg-slate-50/50"
                     style={{ border: '2px dashed var(--border-color)', color: 'var(--text-secondary)' }}>
                <Upload size={22} style={{ color: 'var(--text-muted)' }} />
                <span className="font-medium text-xs">{t('Galería')}</span>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhotoFile(e.target.files[0] || null)}
                />
              </label>
            </div>

            {photoFile && (
              <p className="text-xs font-medium mt-2 text-center" style={{ color: '#2563EB' }}>{photoFile.name}</p>
            )}

            <button type="submit" className="btn btn-primary w-full mt-5" disabled={isUploading}>
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {t('Guardando...')}
                </span>
              ) : t('Guardar Casa')}
            </button>
          </form>
        </div>

        {/* ── Mapa ── */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-base font-bold flex items-center gap-2 text-primary">
              <MapPin size={16} style={{ color: '#2563EB' }} /> {t('Geolocalización')}
            </h3>
          </div>
          <p className="text-xs mb-3 text-secondary">{t('Usa el botón de ubicación del mapa, haz clic en el mapa o arrastra el marcador para posicionar la casa.')}</p>

          {insideTerritory === true && (
            <div className="p-2.5 rounded-xl mb-3 text-xs font-medium" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34D399' }}>
              {t('Ubicación correcta dentro del territorio seleccionado.')}
            </div>
          )}
          {insideTerritory === false && formData.territorio_id && (
            <div className="p-2.5 rounded-xl mb-3 text-xs font-medium" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#D97706' }}>
              {t('Ubicación fuera del territorio seleccionado. Puedes guardar de todos modos.')}
            </div>
          )}

          {gpsPermission === 'denied' && (
            <div className="p-3 rounded-xl mb-3 text-xs" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="font-semibold mb-1" style={{ color: '#D97706' }}>{t('Ubicación GPS desactivada')}</p>
              <p style={{ color: '#92400E' }}>
                {t('Para mejor precisión, activa la ubicación en la configuración de tu navegador:')}
                <br/>Configuración → Privacidad → Ubicación → Permitir para este sitio.
              </p>
            </div>
          )}

          <div className="flex-1 rounded-xl overflow-hidden" style={{ minHeight: '380px' }}>
            <MapContainer center={[position.lat, position.lng]} zoom={14} style={{ height: '100%', width: '100%', minHeight: '380px' }}>
              <DarkTileLayers />
              {/* Capa de labels con efecto neón brillante */}
              <LocationMarker position={position} setPosition={setPosition} />
              <MapCenterer territorioObj={selectedTerritoryObj} />
              {selectedTerritoryObj?.coordenadas && (
                <Polygon positions={selectedTerritoryObj.coordenadas} pathOptions={{ color: selectedTerritoryObj.color, fillOpacity: 0.15 }} />
              )}
              {manzanasDelTerritorio.map(m => (
                <Polygon
                  key={`mz-${m.id}`}
                  positions={m.coordenadas}
                  pathOptions={{
                    color: m.color || selectedTerritoryObj?.color || '#2563EB',
                    fillColor: m.color || selectedTerritoryObj?.color || '#2563EB',
                    fillOpacity: String(formData.manzana_id) === String(m.id) ? 0.3 : 0.08,
                    weight: String(formData.manzana_id) === String(m.id) ? 3 : 1.5,
                    dashArray: '6 4',
                  }}
                  eventHandlers={{
                    click: () => {
                      setFormData(f => ({ ...f, manzana_id: String(m.id) }));
                    },
                  }}
                >
                  <Tooltip permanent direction="center" className="territory-label">
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#F1F5F9' }}>
                      {m.nombre}
                    </span>
                  </Tooltip>
                </Polygon>
              ))}
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
              <LocateButton onLocate={setPosition} />
            </MapContainer>
            <div className="flex items-center justify-center gap-4 mt-2 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <span>Lat: <strong>{position.lat.toFixed(6)}</strong></span>
              <span className="w-px h-4" style={{ background: 'rgba(0,0,0,0.1)' }} />
              <span>Lng: <strong>{position.lng.toFixed(6)}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Elección de vista ──────────────────────────────────────────────────────────────────
// Móvil (< md) con WebGL2 → mapa 3D a pantalla completa (MapLibre, se carga aparte).
// Escritorio, sin WebGL2, o si el 3D falla → clásica. Ver components/Vista3D.jsx.
const RegisterHouse3D = lazy(() => import('./RegisterHouse3D'));

const RegisterHouse = () => (
  <ElegirVista
    Vista3DComp={RegisterHouse3D}
    render={(onVista3D) => <RegisterHouseClasica onVista3D={onVista3D} />}
  />
);

export default RegisterHouse;
