import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from './Toast';

// Fix default Leaflet icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
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
  seguridad: { bg: '#EF4444', label: 'Seguridad' },
  medica:    { bg: '#3B82F6', label: 'Medica' },
  accidente: { bg: '#F97316', label: 'Accidente' },
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  return `Hace ${Math.floor(diff / 3600)} h`;
}

// Point-in-polygon (ray casting) — no external dependencies
function pointInPolygon(lat, lng, coords) {
  if (!coords || coords.length < 3) return false;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [yi, xi] = coords[i];
    const [yj, xj] = coords[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
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

export default function PanicAlert() {
  const { user } = useAuth();
  const { territorios } = useData();
  const toast = useToast();

  const [alerta, setAlerta]         = useState(null);
  const [emisor, setEmisor]         = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [respondiendo, setRespondiendo] = useState(false);
  const [tick, setTick]             = useState(0); // For live timer

  // Refs so stable channel callbacks can access latest values
  const userRef       = useRef(user);
  const emisorRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const oscsRef       = useRef([]);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { emisorRef.current = emisor; }, [emisor]);

  // Live timer — update every second while modal is open
  useEffect(() => {
    if (!showModal || !alerta) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [showModal, alerta]);

  // Find territory for the alert location
  const alertTerritorio = useMemo(() => {
    if (!alerta?.latitud || !alerta?.longitud || !territorios?.length) return null;
    return territorios.find(t =>
      t.coordenadas && t.coordenadas.length >= 3 &&
      pointInPolygon(alerta.latitud, alerta.longitud, t.coordenadas)
    ) || null;
  }, [alerta?.latitud, alerta?.longitud, territorios]);

  const handleInsert = useCallback(async (payload) => {
    const a = payload.new;
    if (!a.activa) return;
    if (a.usuario_id === userRef.current?.id) return;

    // Alarm + vibration
    playAlarm(audioCtxRef, oscsRef);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);

    // Fetch who activated
    const { data: emisorData } = await supabase
      .from('app_usuarios')
      .select('id, nombre, telefono')
      .eq('id', a.usuario_id)
      .single();

    setAlerta(a);
    setEmisor(emisorData || null);
    emisorRef.current = emisorData || null;
    setShowModal(true);

    // Native browser notification (works even with tab minimized)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('🚨 ALERTA DE EMERGENCIA', {
          body: `${emisorData?.nombre || 'Un compañero'} necesita ayuda — ${TIPO_CFG[a.tipo]?.label || a.tipo}`,
          icon: '/JW.jpg',
          badge: '/JW.jpg',
          tag: 'panic-alert',
          requireInteraction: true,
        });
      } catch {
        // Notification API not available
      }
    }
  }, []);

  const handleUpdate = useCallback((payload) => {
    const a = payload.new;

    if (!a.activa) {
      // Alert cancelled
      stopAlarm(audioCtxRef, oscsRef);
      setShowModal(false);
      setAlerta(null);
      const nombre = emisorRef.current?.nombre || 'El usuario';
      toast.info(`${nombre} cancelo la alerta`);
      setEmisor(null);
      return;
    }

    // Update respondieron in real time
    setAlerta(prev => (prev && prev.id === a.id ? { ...prev, respondieron: a.respondieron, tipo: a.tipo } : prev));
  }, [toast]);

  // Subscribe to Realtime events
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('alertas-panico')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas_panico' }, handleInsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alertas_panico' }, handleUpdate)
      .subscribe();

    return () => {
      stopAlarm(audioCtxRef, oscsRef);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Check for existing active alerts when app opens
  useEffect(() => {
    if (!user) return;
    const checkExisting = async () => {
      const { data } = await supabase
        .from('alertas_panico')
        .select('*')
        .eq('activa', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const existing = data[0];
        if (existing.usuario_id !== user.id) {
          handleInsert({ new: existing });
        }
      }
    };
    checkExisting();
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
    toast.success('Respondiste: Voy en camino');
  };

  if (!showModal || !alerta) return null;

  const respondieron = Array.isArray(alerta.respondieron) ? alerta.respondieron : [];
  const tipoCfg      = TIPO_CFG[alerta.tipo] || { bg: '#6B7280', label: alerta.tipo };
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
      `}</style>

      <div
        className="fixed inset-0 z-[99999] flex flex-col overflow-y-auto"
        style={{ backgroundColor: 'rgba(60,0,0,0.97)' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6 text-center shrink-0">
          <h1 className="text-3xl font-black text-white animate-pulse tracking-tight leading-tight">
            &#9888;&#65039; ALERTA DE EMERGENCIA
          </h1>
          <p className="text-red-300 text-sm mt-2">{timeAgo(alerta.created_at)}</p>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 pb-8 space-y-4 max-w-lg mx-auto w-full">

          {/* Emisor + tipo + territory + mensaje */}
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(239,68,68,0.4)' }}
          >
            <p className="text-slate-400 text-xs uppercase tracking-wider">Activado por</p>
            <p className="text-white font-black text-2xl">{emisor?.nombre ?? '...'}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: tipoCfg.bg }}
              >
                {tipoCfg.label}
              </span>
              {alertTerritorio && (
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: alertTerritorio.color || '#6B7280' }}
                >
                  📍 {alertTerritorio.nombre}
                </span>
              )}
            </div>
            {alerta.mensaje ? (
              <p className="text-slate-200 text-sm italic mt-1">"{alerta.mensaje}"</p>
            ) : null}
          </div>

          {/* Mini map with territory polygon */}
          {hasCoords && (
            <div className="rounded-2xl overflow-hidden" style={{ height: 192 }}>
              <MapContainer
                center={[alerta.latitud, alerta.longitud]}
                zoom={15}
                style={{ width: '100%', height: '100%' }}
                zoomControl={false}
                attributionControl={false}
                dragging={false}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap &copy; CARTO'
                />
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                  className="neon-labels"
                />
                {alertTerritorio?.coordenadas && (
                  <Polygon
                    positions={alertTerritorio.coordenadas}
                    pathOptions={{
                      color: alertTerritorio.color || '#3B82F6',
                      fillColor: alertTerritorio.color || '#3B82F6',
                      fillOpacity: 0.12,
                      weight: 2,
                      dashArray: '8 4',
                    }}
                  />
                )}
                <Marker position={[alerta.latitud, alerta.longitud]} icon={redBlinkIcon} />
              </MapContainer>
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
              <p className="text-slate-500 text-sm">Nadie ha respondido aun</p>
            ) : (
              <ul className="space-y-1.5">
                {respondieron.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <span className="text-white font-medium">{r.nombre}</span>
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
              {respondiendo ? 'Registrando...' : '\u2705 VOY EN CAMINO'}
            </button>

            {emisor?.telefono && (
              <a
                href={`tel:${emisor.telefono}`}
                className="block w-full py-3 rounded-2xl font-bold text-white text-base text-center"
                style={{ backgroundColor: '#1D4ED8' }}
              >
                {'\uD83D\uDCDE'} LLAMAR A {emisor.nombre?.split(' ')[0] ?? emisor.nombre}
              </a>
            )}

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
                  Google Maps
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
