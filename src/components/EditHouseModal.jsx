import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { X, Locate, Camera, Upload, MapPin, Mic, Square, Trash2 } from 'lucide-react';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import ModalOverlay from './ModalOverlay';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';
import { STATUS_OPTIONS, getStatusColor } from '../utils/constants';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import { supabase } from '../supabaseClient';

L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const DraggableMarker = ({ position, setPosition }) => {
  useMapEvents({ click(e) { setPosition(e.latlng); } });
  return position ? (
    <Marker
      position={position}
      draggable
      eventHandlers={{ dragend(e) { setPosition(e.target.getLatLng()); } }}
    />
  ) : null;
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' — ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const EditHouseModal = ({ casa, onClose, onSaved }) => {
  const { territorios, manzanas, updateCasa, uploadPhoto, fetchHistorialCasa } = useData();
  const toast = useToast();
  const photoInputRef = useRef(null);

  const [formData, setFormData] = useState({
    territorio_id:       casa.territorio_id   ?? '',
    manzana_id:          casa.manzana_id      ?? '',
    direccion:           casa.direccion        ?? '',
    estado:              casa.estado           ?? 'Pendiente',
    nombre_contacto:     casa.nombre_contacto  ?? '',
    telefono:            casa.telefono         ?? '',
    tiene_caso_especial: casa.tiene_caso_especial ?? false,
    tipo_caso:           casa.tipo_caso        ?? '',
    detalles_caso:       casa.detalles_caso    ?? '',
    notas:               casa.notas            ?? '',
  });

  const manzanasDelTerritorio = useMemo(
    () => manzanas.filter(m => String(m.territorio_id) === String(formData.territorio_id)),
    [manzanas, formData.territorio_id]
  );

  const [position, setPosition] = useState({
    lat: casa.latitud  ?? 31.7619,
    lng: casa.longitud ?? -106.4850,
  });

  // Foto existente vs nueva
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(casa.foto_url || null);
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [locating, setLocating]   = useState(false);
  const [saving, setSaving]       = useState(false);

  // Nota de voz existente vs nueva grabación
  const [existingAudioUrl, setExistingAudioUrl] = useState(casa.audio_url || null);
  const { isRecording, audioBlob, audioUrl, recordingTimeFormatted, startRecording, stopRecording, clearRecording } = useVoiceRecorder();

  // Historial
  const [historial, setHistorial]       = useState([]);
  const [loadingHist, setLoadingHist]   = useState(true);

  useEffect(() => {
    fetchHistorialCasa(casa.id)
      .then(data => setHistorial(data))
      .catch(() => setHistorial([]))
      .finally(() => setLoadingHist(false));
  }, [casa.id]);

  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

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

  const handleSave = async () => {
    if (!formData.direccion.trim()) {
      toast.error('La dirección es obligatoria');
      return;
    }

    setSaving(true);
    try {
      let foto_url = existingPhotoUrl; // mantener la actual por defecto

      if (photoFile) {
        // Nueva foto: subir y reemplazar
        foto_url = await uploadPhoto(photoFile);
      } else if (!existingPhotoUrl) {
        // Foto eliminada sin reemplazo
        foto_url = null;
      }

      // Subir nueva nota de voz si existe
      let audio_url = existingAudioUrl;
      if (audioBlob) {
        const ext = audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: audioError } = await supabase.storage
          .from('notas_voz')
          .upload(fileName, audioBlob, { contentType: audioBlob.type, upsert: false });
        if (audioError) {
          console.error('Error subiendo audio:', audioError);
          const msg = audioError.message || JSON.stringify(audioError);
          if (msg.includes('not found') || audioError.statusCode === 404) {
            toast.error('El bucket de notas de voz no existe. Contacta al administrador.');
          } else if (msg.includes('row-level security') || msg.includes('policy')) {
            toast.error('Sin permisos para subir audio. Contacta al administrador.');
          } else {
            toast.error('Error al subir nota de voz: ' + msg);
          }
          // Continuar sin audio — no bloquear el guardado de la casa
        } else {
          const { data: urlData } = supabase.storage.from('notas_voz').getPublicUrl(fileName);
          audio_url = urlData?.publicUrl || null;
        }
      }

      const territorio = territorios.find(t => String(t.id) === String(formData.territorio_id));

      await updateCasa(casa.id, {
        territorio_id:       formData.territorio_id ? parseInt(formData.territorio_id, 10) : casa.territorio_id,
        territorio_nombre:   territorio?.nombre || casa.territorio_nombre || '',
        ...(formData.manzana_id ? { manzana_id: parseInt(formData.manzana_id, 10) } : { manzana_id: null }),
        direccion:           formData.direccion,
        estado:              formData.estado,
        nombre_contacto:     formData.nombre_contacto,
        telefono:            formData.telefono,
        tiene_caso_especial: formData.tiene_caso_especial,
        tipo_caso:           formData.tipo_caso,
        detalles_caso:       formData.detalles_caso,
        notas:               formData.notas,
        latitud:             position.lat,
        longitud:            position.lng,
        foto_url,
        ...(audio_url !== undefined ? { audio_url } : {}),
      });

      toast.success('Casa actualizada correctamente');
      onSaved?.();
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} size="large">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold heading-gradient m-0">Editar Casa</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          style={{ color: '#64748B' }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── Columna izquierda: Formulario ── */}
        <div className="flex flex-col gap-4">
          {/* Sección 1: Datos generales */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                   style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>1</div>
              <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Datos Generales</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Territorio</label>
              <select
                value={formData.territorio_id}
                onChange={e => setFormData(f => ({ ...f, territorio_id: e.target.value, manzana_id: '' }))}
              >
                <option value="">Selecciona un territorio...</option>
                {territorios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            {manzanasDelTerritorio.length > 0 && (
              <div className="form-group">
                <label className="form-label">Manzana (opcional)</label>
                <select
                  value={formData.manzana_id}
                  onChange={e => setFormData(f => ({ ...f, manzana_id: e.target.value }))}
                >
                  <option value="">Sin manzana específica</option>
                  {manzanasDelTerritorio.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Direccion Completa *</label>
              <input
                required
                value={formData.direccion}
                onChange={e => setFormData(f => ({ ...f, direccion: e.target.value }))}
                placeholder="Ej: Calle Principal 123"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Estado de Visita</label>
              <select
                value={formData.estado}
                onChange={e => setFormData(f => ({ ...f, estado: e.target.value }))}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Sección 2: Residentes */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                   style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>2</div>
              <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Residentes y Casos</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="form-group flex-1">
                <label className="form-label">Nombre del Contacto</label>
                <input
                  value={formData.nombre_contacto}
                  onChange={e => setFormData(f => ({ ...f, nombre_contacto: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">Telefono</label>
                <input
                  type="tel"
                  value={formData.telefono}
                  onChange={e => setFormData(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="form-group flex justify-center">
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none font-medium" style={{ color: '#64748B' }}>
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
              <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="form-group mb-0">
                  <label className="form-label">Tipo de Caso</label>
                  <select
                    value={formData.tipo_caso}
                    onChange={e => setFormData(f => ({ ...f, tipo_caso: e.target.value }))}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Expulsado">Expulsado</option>
                    <option value="Censurado">Censurado</option>
                    <option value="Disciplinado">Disciplinado</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Detalles</label>
                  <textarea
                    rows={2}
                    value={formData.detalles_caso}
                    onChange={e => setFormData(f => ({ ...f, detalles_caso: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="form-group mt-3">
              <label className="form-label">Notas Generales</label>
              <textarea
                rows={2}
                value={formData.notas}
                onChange={e => setFormData(f => ({ ...f, notas: e.target.value }))}
              />
            </div>

            {/* Nota de Voz */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                     style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.35)', color: '#DC2626' }}>
                  <Mic size={12} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Nota de Voz</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
              </div>

              {/* Audio existente */}
              {existingAudioUrl && !audioUrl && (
                <div className="space-y-2 mb-2">
                  <audio controls src={existingAudioUrl} className="w-full" style={{ height: '36px' }} />
                  <button
                    type="button"
                    onClick={() => setExistingAudioUrl(null)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.05)' }}
                  >
                    <Trash2 size={12} /> Eliminar nota de voz
                  </button>
                </div>
              )}

              {/* Nueva grabación */}
              {!existingAudioUrl && (
                <div className="flex flex-col items-center gap-2">
                  {!audioUrl ? (
                    <>
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold transition-all shadow-md"
                        style={{ background: isRecording ? '#DC2626' : '#EF4444' }}
                      >
                        {isRecording ? <Square size={18} fill="white" /> : <Mic size={20} />}
                      </button>
                      {isRecording ? (
                        <span className="text-xs font-mono font-bold" style={{ color: '#DC2626' }}>
                          Grabando... {recordingTimeFormatted}
                        </span>
                      ) : (
                        <span className="text-xs text-secondary">Toca para grabar una nota de voz</span>
                      )}
                    </>
                  ) : (
                    <div className="w-full space-y-2">
                      <audio controls src={audioUrl} className="w-full" style={{ height: '36px' }} />
                      <button
                        type="button"
                        onClick={clearRecording}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                        style={{ color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.05)' }}
                      >
                        <Trash2 size={12} /> Eliminar grabación
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sección 3: Foto */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                   style={{ background: 'rgba(37,99,235,0.1)', border: '2px solid rgba(37,99,235,0.35)', color: '#2563EB' }}>3</div>
              <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Evidencia Fotografica</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(37,99,235,0.12)' }} />
            </div>

            {/* Foto existente */}
            {existingPhotoUrl && !photoPreview && (
              <div className="relative w-full h-36 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                <img src={existingPhotoUrl} alt="Foto actual" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setExistingPhotoUrl(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                >
                  <X size={12} />
                </button>
                <span className="absolute bottom-2 left-2 text-xs text-white px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  Foto actual
                </span>
              </div>
            )}

            {/* Preview nueva foto */}
            {photoPreview && (
              <div className="relative w-full h-36 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                <img src={photoPreview} alt="Nueva foto" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                >
                  <X size={12} />
                </button>
                <span className="absolute bottom-2 left-2 text-xs text-white px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.7)' }}>
                  Nueva foto
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <label className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-colors text-sm hover:bg-blue-50/50"
                     style={{ border: '2px dashed rgba(37,99,235,0.3)', color: '#2563EB' }}>
                <Camera size={20} />
                <span className="font-medium text-xs">Tomar Foto</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                       onChange={(e) => setPhotoFile(e.target.files[0] || null)} />
              </label>
              <label className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-colors text-sm hover:bg-slate-50/50"
                     style={{ border: '2px dashed rgba(0,0,0,0.15)', color: '#475569' }}>
                <Upload size={20} style={{ color: '#94A3B8' }} />
                <span className="font-medium text-xs">Galeria</span>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                       onChange={(e) => setPhotoFile(e.target.files[0] || null)} />
              </label>
            </div>
          </div>
        </div>

        {/* ── Columna derecha: Mapa ── */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin size={15} style={{ color: '#2563EB' }} />
                <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Geolocalizacion</span>
              </div>
              <button
                type="button"
                onClick={handleLocate}
                disabled={locating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
                style={{ border: '1px solid rgba(37,99,235,0.3)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}
              >
                <Locate size={12} />
                {locating ? 'Obteniendo GPS...' : 'Usar GPS'}
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: '#475569' }}>
              Arrastra el marcador o haz clic en el mapa para reubicar la casa.
            </p>

            <div className="rounded-xl overflow-hidden" style={{ height: '260px' }}>
              <MapContainer
                center={[position.lat, position.lng]}
                zoom={16}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap &copy; CARTO'
                />
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" className="neon-labels" />
                <DraggableMarker position={position} setPosition={setPosition} />
              </MapContainer>
            </div>

            <div className="flex items-center justify-center gap-4 mt-2 px-3 py-2 rounded-lg text-xs font-mono"
                 style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', color: '#475569' }}>
              <span>Lat: <strong>{position.lat.toFixed(6)}</strong></span>
              <span className="w-px h-4" style={{ background: 'rgba(0,0,0,0.1)' }} />
              <span>Lng: <strong>{position.lng.toFixed(6)}</strong></span>
            </div>
          </div>

          {/* ── Historial de Visitas ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Historial de Visitas</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
            </div>

            {loadingHist ? (
              <p className="text-xs" style={{ color: '#94A3B8' }}>Cargando historial...</p>
            ) : historial.length === 0 ? (
              <p className="text-xs" style={{ color: '#94A3B8' }}>Sin historial de visitas</p>
            ) : (
              <div className="relative pl-4" style={{ borderLeft: '2px solid rgba(0,0,0,0.08)' }}>
                {historial.map((h, idx) => (
                  <div key={h.id} className={`relative pb-4 ${idx === historial.length - 1 ? '' : ''}`}>
                    {/* dot */}
                    <div
                      className="absolute -left-[1.15rem] top-1 w-3.5 h-3.5 rounded-full border-2 border-white"
                      style={{ background: getStatusColor(h.estado_nuevo) }}
                    />
                    <p className="text-xs mb-0.5" style={{ color: '#94A3B8' }}>{formatDate(h.created_at)}</p>
                    <p className="text-xs font-medium" style={{ color: '#475569' }}>
                      <span style={{ color: '#0F172A' }}>{h.usuario_nombre || 'Usuario'}</span>{' '}
                      cambio estado:{' '}
                      <span style={{ color: getStatusColor(h.estado_anterior) }}>{h.estado_anterior}</span>
                      {' → '}
                      <span style={{ color: getStatusColor(h.estado_nuevo) }}>{h.estado_nuevo}</span>
                    </p>
                    {h.notas && (
                      <p className="text-xs mt-0.5 italic" style={{ color: '#64748B' }}>{h.notas}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        <button type="button" onClick={onClose} className="btn btn-outline">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Guardando...
            </>
          ) : 'Guardar Cambios'}
        </button>
      </div>
    </ModalOverlay>
  );
};

export default EditHouseModal;
