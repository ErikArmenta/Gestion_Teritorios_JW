import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as turf from '@turf/turf';
import {
  ChevronUp, ChevronDown, MapPin, Camera, Upload, Mic, Square, Trash2, X, Loader2, Check, AlertTriangle,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import NotificationBell from '../components/NotificationBell';
import BotonesMapa3D from '../components/BotonesMapa3D';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import useGuardarCasa from '../hooks/useGuardarCasa';
import useMapa3D, { leerPrefs3D, guardarPrefs3D } from '../hooks/useMapa3D';
import { STATUS_OPTIONS, getStatusColor } from '../utils/constants';
import {
  maplibregl, actualizarFuente, poligonosGeoJSON, casasBloquesGeoJSON, casasPuntosGeoJSON,
  seleccionGeoJSON, cuadrado, limitesDe, VACIO,
} from '../utils/map3d';
import { t } from '../i18n';

// "Registrar casa" en móvil: mapa 3D a pantalla completa (MapLibre) + panel inferior.
// El pin se queda en el centro del mapa: mueves el mapa (o tocas un edificio / un punto) y la casa
// queda ahí. Territorio y manzana se detectan solos según el pin. El guardado es el mismo que la
// vista clásica (useGuardarCasa → addCasa, con cola offline).
// ?territorio=ID (desde el mapa principal) → abre sobre ese territorio, ya elegido.

const EMPTY_FORM = {
  direccion: '', estado: 'Pendiente', nombre_contacto: '', telefono: '',
  tiene_caso_especial: false, tipo_caso: '', detalles_caso: '', notas: '',
};
const CENTRO_DEFAULT = { lat: 31.7619, lng: -106.4850 };

// Pin negro con casa amarilla (sin texto de usuario: es seguro como HTML fijo)
const PIN_HTML = `
  <div class="m3d-pin__icono">
    <svg width="44" height="56" viewBox="0 0 44 56" aria-hidden="true">
      <ellipse cx="22" cy="53" rx="7" ry="2.5" fill="rgba(0,0,0,0.28)"/>
      <path d="M22 2C11.5 2 3 10.3 3 20.6 3 34.5 22 52 22 52S41 34.5 41 20.6C41 10.3 32.5 2 22 2Z"
            fill="#0F172A" stroke="#FFFFFF" stroke-width="2.5"/>
      <path d="M22 11.5 13.5 18.6V29h6.2v-6h4.6v6h6.2V18.6Z" fill="#FACC15"/>
    </svg>
  </div>`;

const puntoEn = (feature, pt) => {
  try { return turf.booleanPointInPolygon(pt, feature); } catch { return false; }
};

const RegisterHouse3D = ({ onVistaClasica }) => {
  const { territorios, casas, manzanas } = useData();
  const { theme } = useTheme();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { guardarCasa, isUploading } = useGuardarCasa();
  const { isRecording, audioBlob, audioUrl, recordingTimeFormatted, startRecording, stopRecording, clearRecording } = useVoiceRecorder();

  const territorioParam = searchParams.get('territorio');
  const mapDivRef = useRef(null);
  const dirRef = useRef(null);
  const ubicadoRef = useRef(false);   // ya llegó la 1ª posición GPS
  const encuadradoRef = useRef(false); // ya se encuadró sobre los territorios

  const [prefs, setPrefs] = useState(leerPrefs3D);
  const oscuro = theme === 'dark';

  const [position, setPosition] = useState(CENTRO_DEFAULT);
  const [moviendo, setMoviendo] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [territorioElegido, setTerritorioElegido] = useState(territorioParam); // null = automático (según el pin)
  const [manzanaElegida, setManzanaElegida] = useState(null);
  const [expandido, setExpandido] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [confirmarFuera, setConfirmarFuera] = useState(false);
  const [buscandoDir, setBuscandoDir] = useState(false);

  // ── Datos en GeoJSON ──
  const territoriosGJ = useMemo(() => poligonosGeoJSON(territorios), [territorios]);
  const casasBloques = useMemo(() => casasBloquesGeoJSON(casas), [casas]);
  const casasPuntos = useMemo(() => casasPuntosGeoJSON(casas), [casas]);

  // ── Territorio / manzana según el pin ──
  const pt = useMemo(() => turf.point([position.lng, position.lat]), [position]);
  const territorioEnPunto = useMemo(
    () => territoriosGJ.features.find(f => puntoEn(f, pt))?.properties.id ?? null,
    [territoriosGJ, pt]
  );
  const territorioId = territorioElegido ?? territorioEnPunto ?? '';
  const territorioObj = useMemo(
    () => territorios.find(te => String(te.id) === String(territorioId)),
    [territorios, territorioId]
  );
  const territorioFeature = useMemo(
    () => territoriosGJ.features.find(f => f.properties.id === String(territorioId)),
    [territoriosGJ, territorioId]
  );
  // true dentro / false fuera / null si el territorio no tiene polígono
  const insideTerritory = territorioId && territorioFeature ? puntoEn(territorioFeature, pt) : null;

  const manzanasDelTerritorio = useMemo(
    () => manzanas.filter(m => String(m.territorio_id) === String(territorioId)),
    [manzanas, territorioId]
  );
  const manzanasGJ = useMemo(
    () => poligonosGeoJSON(manzanasDelTerritorio, territorioObj?.color || '#2563EB'),
    [manzanasDelTerritorio, territorioObj]
  );
  const manzanaEnPunto = useMemo(
    () => manzanasGJ.features.find(f => puntoEn(f, pt))?.properties.id ?? null,
    [manzanasGJ, pt]
  );
  const manzanaElegidaValida = manzanaElegida && manzanasDelTerritorio.some(m => String(m.id) === manzanaElegida)
    ? manzanaElegida : null;
  const manzanaId = manzanaElegidaValida ?? manzanaEnPunto ?? '';

  const datos = useMemo(() => ({
    territorios: territoriosGJ, manzanas: manzanasGJ, 'casas-bloques': casasBloques, 'casas-puntos': casasPuntos,
  }), [territoriosGJ, manzanasGJ, casasBloques, casasPuntos]);

  // ── Eventos propios de esta pantalla (se registran una vez al crear el mapa) ──
  const alCrear = (map, geo) => {
    // Pin fijo en el centro (no recibe toques: arrastrar sobre él mueve el mapa)
    const pinEl = document.createElement('div');
    pinEl.className = 'm3d-pin';
    pinEl.innerHTML = PIN_HTML;
    const pin = new maplibregl.Marker({ element: pinEl, anchor: 'bottom', offset: [0, 4] })
      .setLngLat(map.getCenter())
      .addTo(map);

    // Bloque amarillo bajo el pin: el edificio de OSM si hay, si no un cuadrado del tamaño de una casa
    const resaltar = () => {
      if (!map.getSource('seleccion')) return;
      if (map.getZoom() < 15) { actualizarFuente(map, 'seleccion', VACIO); return; }
      const c = map.getCenter();
      const p = map.project(c);
      const edificio = map.getLayer('edificios-3d')
        ? map.queryRenderedFeatures([[p.x - 2, p.y - 2], [p.x + 2, p.y + 2]], { layers: ['edificios-3d'] })[0]
        : null;
      actualizarFuente(map, 'seleccion', edificio
        ? seleccionGeoJSON(edificio.geometry, Number(edificio.properties?.render_height) || 4)
        : seleccionGeoJSON({ type: 'Polygon', coordinates: cuadrado(c.lng, c.lat) }, 5));
    };

    map.on('style.load', resaltar);
    geo.on('geolocate', () => { ubicadoRef.current = true; });
    map.on('movestart', () => { setMoviendo(true); actualizarFuente(map, 'seleccion', VACIO); });
    map.on('move', () => pin.setLngLat(map.getCenter()));
    map.on('moveend', () => {
      const c = map.getCenter();
      setMoviendo(false);
      setPosition({ lat: c.lat, lng: c.lng });
      resaltar();
    });

    // Toque: en una casa registrada → su ficha; en un edificio → el pin va a su centro; si no, al punto tocado
    map.on('click', (e) => {
      const capasCasa = ['casas-3d', 'casas-punto'].filter(id => map.getLayer(id));
      const casa = capasCasa.length ? map.queryRenderedFeatures(e.point, { layers: capasCasa })[0] : null;
      if (casa) {
        const div = document.createElement('div');
        div.className = 'm3d-popup';
        const dir = document.createElement('strong');
        dir.textContent = casa.properties.direccion || t('Sin dirección');
        const estado = document.createElement('span');
        estado.textContent = t(casa.properties.estado);
        estado.style.color = casa.properties.color;
        div.append(dir, estado);
        new maplibregl.Popup({ offset: 12, closeButton: false, maxWidth: '240px' })
          .setLngLat(e.lngLat).setDOMContent(div).addTo(map);
        return;
      }
      let destino = e.lngLat;
      const edificio = map.getLayer('edificios-3d')
        ? map.queryRenderedFeatures(e.point, { layers: ['edificios-3d'] })[0]
        : null;
      if (edificio) {
        try {
          const [lng, lat] = turf.centroid(edificio).geometry.coordinates;
          destino = { lng, lat };
        } catch { /* se queda el punto tocado */ }
      }
      map.easeTo({ center: destino, zoom: Math.max(map.getZoom(), 17.5), duration: 600 });
    });
  };

  const { mapRef, sinConexion } = useMapa3D(mapDivRef, {
    prefs, oscuro, datos, alCrear, onFallo: onVistaClasica,
    autoUbicar: !territorioParam, // desde un territorio: abrir sobre él, no sobre el GPS
  });

  // Sin GPS todavía: abrir sobre el territorio pedido o sobre todos, en cuanto lleguen
  useEffect(() => {
    const map = mapRef.current;
    if (!map || ubicadoRef.current || encuadradoRef.current) return;
    const pedido = territorioParam && territoriosGJ.features.find(f => f.properties.id === String(territorioParam));
    const limites = limitesDe(pedido || territoriosGJ);
    if (!limites) return;
    encuadradoRef.current = true;
    map.fitBounds(limites, { padding: 40, maxZoom: pedido ? 18 : 16, duration: 0 });
  }, [territoriosGJ, territorioParam, mapRef]);

  // Vista previa de la foto
  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const cambiarPrefs = (cambio) => setPrefs(p => { const n = { ...p, ...cambio }; guardarPrefs3D(n); return n; });
  const campo = (k) => (e) => setFormData(f => ({ ...f, [k]: e.target.value }));

  // Dirección sugerida (OpenStreetMap Nominatim). Solo al tocar el botón: su uso justo es ≤ 1 petición/seg.
  const sugerirDireccion = async () => {
    if (!navigator.onLine) { toast.warning(t('Sin conexión: escribe la dirección a mano')); return; }
    setBuscandoDir(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=es`
        + `&lat=${position.lat.toFixed(6)}&lon=${position.lng.toFixed(6)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const a = j.address || {};
      const calle = [a.road || a.pedestrian || a.residential || a.footway || '', a.house_number || ''].filter(Boolean).join(' ');
      const colonia = a.neighbourhood || a.suburb || a.quarter || a.city_district || '';
      const dir = [calle, colonia].filter(Boolean).join(', ');
      if (dir) {
        setFormData(f => ({ ...f, direccion: dir }));
        if (!a.house_number) {
          toast.info(t('Agrega el número de la casa'));
          setTimeout(() => dirRef.current?.focus(), 50);
        }
      } else {
        toast.info(t('No se encontró la dirección; escríbela a mano'));
      }
    } catch {
      toast.error(t('No se pudo buscar la dirección'));
    } finally {
      setBuscandoDir(false);
    }
  };

  const guardar = async (forzar = false) => {
    if (!territorioId) {
      toast.warning(t('Mueve el pin dentro de un territorio o elige uno'));
      return;
    }
    if (!formData.direccion.trim()) {
      toast.warning(t('Escribe la dirección'));
      dirRef.current?.focus();
      return;
    }
    if (insideTerritory === false && !forzar) { setConfirmarFuera(true); return; }
    setConfirmarFuera(false);

    const ok = await guardarCasa({
      formData: { ...formData, territorio_id: territorioId, manzana_id: manzanaId },
      position,
      photoFile,
      audioBlob,
    });
    if (ok) {
      // Se quedan el territorio y la manzana: lo normal es registrar la casa de al lado
      setFormData(EMPTY_FORM);
      setPhotoFile(null);
      clearRecording();
      setExpandido(false);
      try { navigator.vibrate?.(30); } catch { /* sin vibración */ }
    }
  };

  const colorTerr = territorioObj?.color || '#2563EB';

  return (
    <div className="m3d">
      {/* ── Mapa ── */}
      <div className="m3d-mapa">
        <div ref={mapDivRef} className={`m3d-canvas${moviendo ? ' is-moving' : ''}`} />

        {/* Barra superior */}
        <div className="m3d-top">
          <div className="m3d-titulo">
            <span className="m3d-titulo__icono"><MapPin size={16} /></span>
            <div className="min-w-0">
              <p className="m3d-titulo__texto">{t('Registrar Casa')}</p>
              <p className="m3d-titulo__sub">{t('Mueve el mapa o toca la casa')}</p>
            </div>
          </div>
          <div className="m3d-campana"><NotificationBell /></div>
        </div>

        <BotonesMapa3D prefs={prefs} onCambiar={cambiarPrefs} onVistaClasica={onVistaClasica} />

        {sinConexion && (
          <div className="m3d-aviso">
            <AlertTriangle size={14} />
            <span>{t('El mapa no cargó (sin conexión). Tu GPS sigue funcionando.')}</span>
          </div>
        )}
      </div>

      {/* ── Panel inferior ── */}
      <div className={`m3d-sheet${expandido ? ' is-open' : ''}`}>
        <button
          type="button"
          className="m3d-sheet__asa"
          onClick={() => setExpandido(v => !v)}
          aria-label={expandido ? t('Menos detalles') : t('Más detalles')}
        >
          <span />
        </button>

        {/* Territorio detectado */}
        <div className="m3d-fila">
          <span className="legend-dot shrink-0" style={{ width: 10, height: 10, borderRadius: 9999, background: colorTerr }} />
          <select
            className="m3d-select"
            value={territorioId}
            onChange={e => {
              const v = e.target.value || null;
              setTerritorioElegido(v && v === territorioEnPunto ? null : v);
              setManzanaElegida(null);
            }}
            aria-label={t('Territorio *')}
          >
            <option value="">{t('Selecciona un territorio...')}</option>
            {territorios.map(te => <option key={te.id} value={String(te.id)}>{te.nombre}</option>)}
          </select>
          {insideTerritory === true && (
            <span className="m3d-chip m3d-chip--ok"><Check size={12} /> {t('Dentro')}</span>
          )}
          {insideTerritory === false && (
            <span className="m3d-chip m3d-chip--warn"><AlertTriangle size={12} /> {t('Fuera')}</span>
          )}
        </div>

        {manzanasDelTerritorio.length > 0 && (
          <div className="m3d-fila">
            <select
              className="m3d-select m3d-select--sm"
              value={manzanaId}
              onChange={e => setManzanaElegida(e.target.value || null)}
              aria-label={t('Manzana (opcional)')}
            >
              <option value="">{t('Sin manzana específica')}</option>
              {manzanasDelTerritorio.map(m => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Dirección */}
        <div className="m3d-fila">
          <input
            ref={dirRef}
            className="m3d-input"
            value={formData.direccion}
            onChange={campo('direccion')}
            placeholder={t('Dirección (ej: Calle Principal 123)')}
            enterKeyHint="done"
            autoComplete="off"
          />
          <button
            type="button"
            className="m3d-btn-icono"
            onClick={sugerirDireccion}
            disabled={buscandoDir}
            title={t('Sugerir dirección del pin')}
            aria-label={t('Sugerir dirección del pin')}
          >
            {buscandoDir ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
          </button>
        </div>

        {/* Detalles opcionales */}
        {expandido && (
          <div className="m3d-extras">
            <div className="flex gap-2">
              <input className="m3d-input" value={formData.nombre_contacto} onChange={campo('nombre_contacto')} placeholder={t('Nombre del Contacto')} />
              <input className="m3d-input" value={formData.telefono} onChange={campo('telefono')} placeholder={t('Teléfono')} type="tel" />
            </div>

            <textarea className="m3d-input" rows={2} value={formData.notas} onChange={campo('notas')} placeholder={t('Notas Generales')} />

            <label className="flex items-center gap-2 cursor-pointer text-sm select-none font-medium text-secondary">
              <input
                type="checkbox"
                className="w-auto accent-blue-500"
                checked={formData.tiene_caso_especial}
                onChange={e => setFormData(f => ({ ...f, tiene_caso_especial: e.target.checked }))}
              />
              {t('Marcar como caso especial')}
            </label>
            {formData.tiene_caso_especial && (
              <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <select className="m3d-select" value={formData.tipo_caso} onChange={campo('tipo_caso')} aria-label={t('Tipo de Caso')}>
                  <option value="">{t('Tipo de Caso')}</option>
                  <option value="Expulsado">{t('Expulsado')}</option>
                  <option value="Censurado">{t('Censurado')}</option>
                  <option value="Disciplinado">{t('Disciplinado')}</option>
                  <option value="Otro">{t('Otro')}</option>
                </select>
                <textarea className="m3d-input" rows={2} value={formData.detalles_caso} onChange={campo('detalles_caso')} placeholder={t('Detalles')} />
              </div>
            )}

            {/* Foto y nota de voz */}
            <div className="flex gap-2">
              <label className="m3d-adjunto" style={{ color: '#2563EB', borderColor: 'rgba(37,99,235,0.35)' }}>
                <Camera size={18} />
                <span>{t('Tomar Foto')}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhotoFile(e.target.files[0] || null)} />
              </label>
              <label className="m3d-adjunto">
                <Upload size={18} />
                <span>{t('Galería')}</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => setPhotoFile(e.target.files[0] || null)} />
              </label>
              {!audioUrl && (
                <button
                  type="button"
                  className="m3d-adjunto"
                  onClick={isRecording ? stopRecording : startRecording}
                  style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.35)' }}
                >
                  {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                  <span>{isRecording ? recordingTimeFormatted : t('Nota de Voz')}</span>
                </button>
              )}
            </div>
            {photoPreview && (
              <div className="relative w-full h-32 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                <img src={photoPreview} alt={t('Foto')} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoFile(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
                  aria-label={t('Quitar foto')}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {audioUrl && (
              <div className="flex items-center gap-2">
                <audio controls src={audioUrl} className="flex-1 min-w-0" style={{ height: '36px' }} />
                <button type="button" onClick={clearRecording} className="m3d-btn-icono" style={{ color: '#DC2626' }} aria-label={t('Eliminar nota de voz')}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Estado + Guardar. Dejan libre la esquina del botón de pánico. */}
        <div className="m3d-estados">
          {STATUS_OPTIONS.map(s => {
            const activo = formData.estado === s;
            const color = getStatusColor(s);
            return (
              <button
                key={s}
                type="button"
                className={`m3d-estado${activo ? ' is-active' : ''}`}
                style={activo ? { background: color, borderColor: color, color: '#fff' } : undefined}
                onClick={() => setFormData(f => ({ ...f, estado: s }))}
                aria-pressed={activo}
              >
                {!activo && <span className="legend-dot" style={{ width: 8, height: 8, borderRadius: 9999, background: color }} />}
                {t(s)}
              </button>
            );
          })}
        </div>

        <div className="m3d-acciones">
          <button
            type="button"
            className="m3d-btn-icono"
            onClick={() => setExpandido(v => !v)}
            aria-label={expandido ? t('Menos detalles') : t('Más detalles')}
            title={expandido ? t('Menos detalles') : t('Más detalles')}
          >
            {expandido ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={() => guardar()} disabled={isUploading}>
            {isUploading ? (
              <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('Guardando...')}</span>
            ) : t('Guardar Casa')}
          </button>
        </div>
      </div>

      {confirmarFuera && (
        <ConfirmModal
          message={t('La ubicación seleccionada NO está dentro del territorio. ¿Guardar de todos modos?')}
          confirmText={t('Guardar')}
          cancelText={t('Cancelar')}
          onConfirm={() => guardar(true)}
          onCancel={() => setConfirmarFuera(false)}
        />
      )}
    </div>
  );
};

export default RegisterHouse3D;
