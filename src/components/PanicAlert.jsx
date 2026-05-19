import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';

// Fix default Leaflet icon
import iconImg from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: iconImg, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Red blinking marker
const redBlinkIcon = L.divIcon({
  html: `<div style="
    width:22px;height:22px;
    background:#EF4444;
    border-radius:50%;
    border:3px solid #fff;
    box-shadow:0 0 0 4px rgba(239,68,68,0.35);
    animation:panicBlink 1s ease-in-out infinite;
  "></div>`,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const TIPO_CFG = {
  seguridad: { bg: '#EF4444', label: 'Seguridad', icon: '🛡️' },
  medica:    { bg: '#3B82F6', label: 'Médica', icon: '🏥' },
  accidente: { bg: '#F97316', label: 'Accidente', icon: '⚠️' },
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  return `Hace ${Math.floor(diff / 3600)} h`;
}

/** Check if point is inside polygon using ray-casting */
function pointInPolygon(lat, lng, polygon) {
  if (!polygon || !polygon.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Find the territory that contains the given coordinates */
function findTerritorio(lat, lng, territorios) {
  if (lat == null || lng == null || !territorios?.length) return null;
  for (const t of territorios) {
    if (t.coordenadas && pointInPolygon(lat, lng, t.coordenadas)) {
      return t;
    }
  }
  // If not inside any polygon, find the nearest territory center
  let nearest = null;
  let minDist = Infinity;
  for (const t of territorios) {
    if (!t.coordenadas?.length) continue;
    const centerLat = t.coordenadas.reduce((s, c) => s + c[0], 0) / t.coordenadas.length;
    const centerLng = t.coordenadas.reduce((s, c) => s + c[1], 0) / t.coordenadas.length;
    const dist = Math.sqrt((lat - centerLat) ** 2 + (lng - centerLng) ** 2);
    if (dist < minDist) { minDist = dist; nearest = t; }
  }
  // Only return nearest if within ~2km (~0.02 degrees)
  return minDist < 0.02 ? nearest : null;
}

// Play sawtooth alarm: alternates 440/880 Hz, 3 seconds total
function playAlarm(ctxRef, oscsRef) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const created = [];
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = i % 2 === 0 ? 440 : 880;
      gain.gain.value = 0.25;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(i * 0.5);
      osc.stop((i + 1) * 0.5);
      created.push(osc);
    }
    oscsRef.current = created;
  } catch {
    // Web Audio not available
  }
}

function stopAlarm(ctxRef, oscsRef) {
  oscsRef.current.forEach(osc => { try { osc.stop(); } catch {} });
  oscsRef.current = [];
  if (ctxRef.current) {
    try { ctxRef.current.close(); } catch {}
    ctxRef.current = null;
  }
}

/** Mini-map component for the alert modal */
const AlertMiniMap = ({ lat, lng, territorio }) => {
  if (lat == null || lng == null) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ height: 192 }}>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          className="neon-labels"
        />
        {territorio?.coordenadas && (
          <Polygon
            positions={territorio.coordenadas}
            pathOptions={{
              color: territorio.color || '#3B82F6',
              fillColor: territorio.color || '#3B82F6',
              fillOpacity: 0.2,
              weight: 2,
              dashArray: '6 4',
            }}
          />
        )}
        <Marker position={[lat, lng]} icon={redBlinkIcon} />
      </MapContainer>
    </div>
  );
};

export default function PanicAlert() {
  const { user } = useAuth();
  const { territorios } = useData();
  const toast = useToast();

  const [alerta, setAlerta]         = useState(null);
  const [emisor, setEmisor]         = useState(null);
  const [territorio, setTerritorio] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [respondiendo, setRespondiendo] = useState(false);
  const [elapsedText, setElapsedText] = useState('');

  // Refs so stable channel callbacks can access latest values
  const userRef       = useRef(user);
  const territoriosRef = useRef(territorios);
  const emisorRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const oscsRef       = useRef([]);
  const timerRef      = useRef(null);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { territoriosRef.current = territorios; }, [territorios]);
  useEffect(() => { emisorRef.current = emisor; }, [emisor]);

  // Update elapsed time every second while alert is active
  useEffect(() => {
    if (showModal && alerta?.created_at) {
      const update = () => setElapsedText(timeAgo(alerta.created_at));
      update();
      timerRef.current = setInterval(update, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [showModal, alerta?.created_at]);

  const procesarAlerta = useCallback(async (a) => {
    if (!a.activa) return;
    // Don't show alert to the user who triggered it
    if (a.usuario_id === userRef.current?.id) return;

    console.log('[PanicAlert] Processing alert:', a.id);

    // Alarm + vibration
    playAlarm(audioCtxRef, oscsRef);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);

    // Browser notification
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('🚨 ALERTA DE EMERGENCIA', {
          body: `Un compañero necesita ayuda. Tipo: ${TIPO_CFG[a.tipo]?.label || a.tipo}`,
          icon: '/favicon.ico',
          tag: `panic-${a.id}`,
          requireInteraction: true,
        });
      } catch {}
    }

    // Fetch who activated
    const { data: emisorData } = await supabase
      .from('app_usuarios')
      .select('id, nombre')
      .eq('id', a.usuario_id)
      .single();

    // Find territory
    const terr = findTerritorio(a.latitud, a.longitud, territoriosRef.current);

    setAlerta(a);
    setEmisor(emisorData || null);
    emisorRef.current = emisorData || null;
    setTerritorio(terr);
    setShowModal(true);
  }, []);

  const handleInsert = useCallback(async (payload) => {
    await procesarAlerta(payload.new);
  }, [procesarAlerta]);

  const handleUpdate = useCallback((payload) => {
    const a = payload.new;

    if (!a.activa) {
      // Alert cancelled
      stopAlarm(audioCtxRef, oscsRef);
      setShowModal(false);
      setAlerta(null);
      const nombre = emisorRef.current?.nombre || 'El usuario';
      toast.info(`${nombre} canceló la alerta`);
      setEmisor(null);
      setTerritorio(null);
      return;
    }

    // Update respondieron in real time
    setAlerta(prev => (prev && prev.id === a.id ? { ...prev, respondieron: a.respondieron, tipo: a.tipo } : prev));
  }, [toast]);

  // Subscribe once on mount (when user is available)
  useEffect(() => {
    if (!user) return;

    const congFilter = (user.congregacion_id && user.rol !== 'Super Admin')
      ? { filter: `congregacion_id=eq.${user.congregacion_id}` }
      : {};

    const channel = supabase
      .channel('alertas-panico')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas_panico', ...congFilter }, handleInsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alertas_panico', ...congFilter }, handleUpdate)
      .subscribe((status) => {
        console.log('[PanicAlert] Subscription status:', status);
      });

    // Broadcast channel: receives alerts instantly regardless of RLS
    const broadcastChannel = supabase
      .channel('panic-global')
      .on('broadcast', { event: 'nueva-alerta' }, async (payload) => {
        await procesarAlerta(payload.payload);
      })
      .subscribe((status) => {
        console.log('[PanicAlert] Broadcast status:', status);
      });

    return () => {
      stopAlarm(audioCtxRef, oscsRef);
      supabase.removeChannel(channel);
      supabase.removeChannel(broadcastChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Also check for any currently active alerts on mount (in case one was created before this component mounted)
  useEffect(() => {
    if (!user) return;
    const checkActiveAlerts = async () => {
      let alertQuery = supabase
        .from('alertas_panico')
        .select('*')
        .eq('activa', true)
        .neq('usuario_id', user.id);
      if (user.congregacion_id && user.rol !== 'Super Admin') alertQuery = alertQuery.eq('congregacion_id', user.congregacion_id);
      const { data } = await alertQuery
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        const a = data[0];
        console.log('[PanicAlert] Found active alert on mount:', a.id);
        
        const { data: emisorData } = await supabase
          .from('app_usuarios')
          .select('id, nombre')
          .eq('id', a.usuario_id)
          .single();

        const terr = findTerritorio(a.latitud, a.longitud, territoriosRef.current);
        
        setAlerta(a);
        setEmisor(emisorData || null);
        emisorRef.current = emisorData || null;
        setTerritorio(terr);
        setShowModal(true);
        playAlarm(audioCtxRef, oscsRef);
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
      }
    };
    checkActiveAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleResponder = async () => {
    if (!alerta || !user) return;
    setRespondiendo(true);

    const respondieron = Array.isArray(alerta.respondieron) ? alerta.respondieron : [];
    if (respondieron.some(r => r.usuario_id === user.id)) {
      setRespondiendo(false);
      setShowModal(false);
      return;
    }

    const entrada = {
      usuario_id: user.id,
      nombre: user.nombre,
      timestamp: new Date().toISOString(),
    };

    await supabase
      .from('alertas_panico')
      .update({ respondieron: [...respondieron, entrada] })
      .eq('id', alerta.id);

    setRespondiendo(false);
    setShowModal(false);
    stopAlarm(audioCtxRef, oscsRef);
    toast.success('Respondiste: Voy en camino');
  };

  if (!showModal || !alerta) return null;

  const respondieron = Array.isArray(alerta.respondieron) ? alerta.respondieron : [];
  const tipoCfg      = TIPO_CFG[alerta.tipo] || { bg: '#6B7280', label: alerta.tipo, icon: '🔔' };
  const hasCoords    = alerta.latitud != null && alerta.longitud != null;
  const mapsUrl      = hasCoords
    ? `https://www.google.com/maps?q=${alerta.latitud},${alerta.longitud}`
    : null;

  return (
    <>
      {/* CSS for blinking marker */}
      <style>{`
        @keyframes panicBlink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.25); }
        }
        @keyframes redPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[99999] flex flex-col overflow-y-auto"
        style={{ backgroundColor: 'rgba(60,0,0,0.97)' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6 text-center shrink-0">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{
              background: 'rgba(239,68,68,0.2)',
              border: '2px solid rgba(239,68,68,0.5)',
              animation: 'redPulse 1.5s ease-in-out infinite',
            }}
          >
            <span className="text-3xl">{tipoCfg.icon}</span>
          </div>
          <h1 className="text-3xl font-black text-white animate-pulse tracking-tight leading-tight">
            &#9888;&#65039; ALERTA DE EMERGENCIA
          </h1>
          <p className="text-red-300 text-sm mt-2">{elapsedText}</p>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 pb-8 space-y-4 max-w-lg mx-auto w-full">

          {/* Emisor + tipo + territorio + mensaje */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(239,68,68,0.4)' }}
          >
            <p className="text-slate-400 text-xs uppercase tracking-wider">Activado por</p>
            <p className="text-white font-black text-2xl">{emisor?.nombre ?? '...'}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: tipoCfg.bg }}
              >
                {tipoCfg.icon} {tipoCfg.label}
              </span>
              {territorio && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: `${territorio.color || '#3B82F6'}25`,
                    color: territorio.color || '#3B82F6',
                    border: `1px solid ${territorio.color || '#3B82F6'}50`,
                  }}
                >
                  📍 {territorio.nombre}
                </span>
              )}
            </div>
            {alerta.mensaje ? (
              <p className="text-slate-200 text-sm italic mt-1">"{alerta.mensaje}"</p>
            ) : null}
          </div>

          {/* Mini map with territory polygon */}
          {hasCoords && (
            <AlertMiniMap lat={alerta.latitud} lng={alerta.longitud} territorio={territorio} />
          )}

          {/* No GPS notice */}
          {!hasCoords && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-slate-400 text-sm">📡 Sin coordenadas GPS disponibles</p>
              <p className="text-slate-500 text-xs mt-1">El usuario no compartió su ubicación</p>
            </div>
          )}

          {/* Responders */}
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Respondedores ({respondieron.length})
            </p>
            {respondieron.length === 0 ? (
              <p className="text-slate-500 text-sm">Nadie ha respondido aún</p>
            ) : (
              <ul className="space-y-1.5">
                {respondieron.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <span className="text-white font-medium">{r.nombre}</span>
                    {r.usuario_id === user?.id && (
                      <span className="text-green-400 text-xs font-bold">(tú)</span>
                    )}
                    <span className="text-slate-400 text-xs ml-auto">{timeAgo(r.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-1">
            <button
              onClick={handleResponder}
              disabled={respondiendo}
              className="w-full py-4 rounded-2xl font-black text-white text-lg tracking-wide transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#16A34A' }}
            >
              {respondiendo
                ? 'Registrando...'
                : respondieron.some(r => r.usuario_id === user?.id)
                  ? '✅ YA RESPONDISTE'
                  : '✅ VOY EN CAMINO'}
            </button>

            <div className="flex gap-3">
              <a
                href="tel:911"
                className="flex-1 py-3 rounded-2xl font-bold text-red-400 text-sm text-center"
                style={{ border: '2px solid #EF4444', backgroundColor: 'rgba(239,68,68,0.12)' }}
              >
                LLAMAR 911
              </a>
              {mapsUrl && (
                <button
                  onClick={() => window.open(mapsUrl, '_blank', 'noopener')}
                  className="flex-1 py-3 rounded-2xl font-bold text-white text-sm"
                  style={{ backgroundColor: '#374151' }}
                >
                  📍 Google Maps
                </button>
              )}
            </div>

            <button
              onClick={() => { setShowModal(false); stopAlarm(audioCtxRef, oscsRef); }}
              className="w-full py-2.5 rounded-2xl font-medium text-slate-500 text-xs"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            >
              Minimizar alerta
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
