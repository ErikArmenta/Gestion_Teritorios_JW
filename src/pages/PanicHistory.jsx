/**
 * NOTA: Si las alertas no se muestran, verificar en Supabase Dashboard:
 * 1. Tabla alertas_panico → Authentication → RLS debe estar OFF
 *    (o tener policy: CREATE POLICY "anon_all" ON alertas_panico FOR ALL USING (true) WITH CHECK (true))
 * 2. La relación con app_usuarios debe existir (FK usuario_id → app_usuarios.id)
 * 3. Verificar en consola del navegador los logs [PanicHistory]
 */
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip as ChartTooltip, Legend, Title,
  PointElement, LineElement, Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Bell, MapPin, Clock, User, Filter, X, ExternalLink, Shield, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import DarkTileLayers from '../components/DarkTileLayers';
import LocateButton from '../components/LocateButton';
import BotonesExportar from '../components/BotonesExportar';
import { t as tx } from '../i18n';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, ChartTooltip, Legend, Title, PointElement, LineElement, Filler);

// Red blinking marker for mini-maps
const redDotIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#EF4444;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 3px rgba(239,68,68,0.35);"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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
    if (t.coordenadas && pointInPolygon(lat, lng, t.coordenadas)) return t;
  }
  let nearest = null;
  let minDist = Infinity;
  for (const t of territorios) {
    if (!t.coordenadas?.length) continue;
    const centerLat = t.coordenadas.reduce((s, c) => s + c[0], 0) / t.coordenadas.length;
    const centerLng = t.coordenadas.reduce((s, c) => s + c[1], 0) / t.coordenadas.length;
    const dist = Math.sqrt((lat - centerLat) ** 2 + (lng - centerLng) ** 2);
    if (dist < minDist) { minDist = dist; nearest = t; }
  }
  return minDist < 0.02 ? nearest : null;
}

const TYPE_CONFIG = {
  seguridad:  { label: 'Seguridad',  bg: 'bg-red-600',    text: 'text-white' },
  medica:     { label: 'Médica',     bg: 'bg-blue-600',   text: 'text-white' },
  accidente:  { label: 'Accidente',  bg: 'bg-orange-500', text: 'text-white' },
};

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDuration = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (ms < 0) return null;
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
};

const TypeBadge = ({ tipo }) => {
  const cfg = TYPE_CONFIG[tipo] || { label: tipo, bg: 'bg-gray-600', text: 'text-white' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {tx(cfg.label)}
    </span>
  );
};

const StatusBadge = ({ activa }) => {
  if (activa) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
        {tx('Activa')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-600 text-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
      {tx('Cerrada')}
    </span>
  );
};

const AlertCard = ({ alerta, territorios }) => {
  const usuario = alerta.app_usuarios;
  const respondieron = Array.isArray(alerta.respondieron) ? alerta.respondieron : [];
  const duracion = formatDuration(alerta.created_at, alerta.cerrada_at);
  const hasCoords = alerta.latitud != null && alerta.longitud != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${alerta.latitud},${alerta.longitud}`
    : null;

  const stripClass = TYPE_CONFIG[alerta.tipo]?.bg || 'bg-gray-600';
  const territorio = findTerritorio(alerta.latitud, alerta.longitud, territorios);

  // Color accent según tipo de alerta
  const tipoAccent = alerta.tipo === 'seguridad' ? '#EF4444'
    : alerta.tipo === 'medica' ? '#3B82F6'
    : alerta.tipo === 'accidente' ? '#F97316' : '#6B7280';

  const [showMap, setShowMap] = useState(false);

  return (
    <div
      className="card overflow-hidden p-0"
      style={{ borderLeft: alerta.activa ? `3px solid ${tipoAccent}` : '3px solid rgba(100,116,139,0.25)' }}
    >
      {/* Header strip */}
      <div className={`h-1.5 w-full ${stripClass}`} />

      <div className="p-4 sm:p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${tipoAccent}15`, border: `1px solid ${tipoAccent}30` }}
            >
              <User size={15} style={{ color: tipoAccent }} />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight text-primary">
                {usuario?.nombre || `Usuario #${alerta.usuario_id}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge tipo={alerta.tipo} />
            <StatusBadge activa={alerta.activa} />
          </div>
        </div>

        {/* Territorio badge */}
        {territorio && (
          <div className="mt-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{
                background: `${territorio.color || '#3B82F6'}15`,
                color: territorio.color || '#3B82F6',
                border: `1px solid ${territorio.color || '#3B82F6'}30`,
              }}
            >
              <MapPin size={11} />
              {territorio.nombre}
              {territorio.responsable && (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>· {territorio.responsable}</span>
              )}
            </span>
          </div>
        )}

        {/* Mensaje */}
        {alerta.mensaje && (
          <p className="mt-3 text-sm rounded-xl px-3 py-2.5 leading-relaxed" style={{
            color: 'var(--text-primary)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-color)',
          }}>
            {alerta.mensaje}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 text-secondary">
            <Clock size={12} style={{ color: '#2563EB' }} />
            {formatDate(alerta.created_at)}
          </span>
          {duracion && (
            <span className="flex items-center gap-1.5 text-secondary">
              <Clock size={12} style={{ color: '#2563EB' }} />
              {tx('Duración:')} <strong style={{ color: '#D97706' }}>{duracion}</strong>
            </span>
          )}
          {hasCoords && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="flex items-center gap-1.5 font-semibold cursor-pointer hover:underline"
              style={{ color: '#059669', background: 'none', border: 'none', padding: 0 }}
            >
              <MapPin size={12} />
              {showMap ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-semibold hover:underline"
              style={{ color: '#2563EB' }}
            >
              <ExternalLink size={10} />
              Google Maps
            </a>
          )}
        </div>

        {/* Embedded mini-map */}
        {showMap && hasCoords && (
          <div className="mt-3 rounded-xl overflow-hidden" style={{ height: 180, border: '1px solid rgba(0,0,0,0.08)' }}>
            <MapContainer
              center={[alerta.latitud, alerta.longitud]}
              zoom={15}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
              attributionControl={false}
              dragging={true}
              scrollWheelZoom={true}
            >
              <DarkTileLayers />
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
              <Marker position={[alerta.latitud, alerta.longitud]} icon={redDotIcon} />
              <LocateButton />
            </MapContainer>
          </div>
        )}

        {/* Respondedores */}
        {respondieron.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#059669' }}>
              Respondieron ({respondieron.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {respondieron.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(5,150,105,0.1)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}
                >
                  <User size={10} />
                  {r.nombre || `Usuario #${r.usuario_id}`}
                  {r.timestamp && (
                    <span className="ml-0.5" style={{ color: '#059669' }}>
                      · {new Date(r.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PanicHistory = () => {
  const { user } = useAuth();
  const { territorios } = useData();
  const { theme } = useTheme();
  // Colores de gráficas según el tema (en oscuro los grises oscuros no se leían)
  const CH_LABEL = theme === 'dark' ? '#CBD5E1' : '#475569';
  const CH_GRID = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  const chartDonutRef = useRef(null);
  const chartBarRef = useRef(null);
  const chartTerrRef = useRef(null);
  const chartLineRef = useRef(null);

  // Filters
  const [filterFechaInicio, setFilterFechaInicio] = useState('');
  const [filterFechaFin, setFilterFechaFin] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  const fetchAlertas = async () => {
    setLoading(true);
    console.log('[PanicHistory] Fetching alertas...');
    const histQuery = supabase
      .from('alertas_panico')
      .select('*, app_usuarios!alertas_panico_usuario_id_fkey(nombre)');
    if (user?.congregacion_id) histQuery.eq('congregacion_id', user.congregacion_id);
    const { data, error, status, statusText } = await histQuery
      .order('created_at', { ascending: false });

    console.log('[PanicHistory] Response:', { data: data?.length, error, status, statusText });

    if (error) {
      console.error('[PanicHistory] Error fetching alertas:', error.message, error.details, error.hint);
      setFetchError(error.message || 'Error al cargar alertas');
      setAlertas([]);
    } else {
      setFetchError(null);
      setAlertas(data || []);
      console.log('[PanicHistory] Loaded', data?.length, 'alertas');
    }

    // Build unique user list for filter select
    const items = data || [];
    const uniqueUsers = [];
    const seen = new Set();
    items.forEach((a) => {
      if (a.usuario_id && !seen.has(a.usuario_id)) {
        seen.add(a.usuario_id);
        uniqueUsers.push({ id: a.usuario_id, nombre: a.app_usuarios?.nombre || `#${a.usuario_id}` });
      }
    });
    setUsuarios(uniqueUsers);
    setLoading(false);
  };

  useEffect(() => { fetchAlertas(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('alertas-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_panico' }, () => {
        fetchAlertas();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const clearFilters = () => {
    setFilterFechaInicio('');
    setFilterFechaFin('');
    setFilterUsuario('');
    setFilterTipo('');
    setFilterEstado('todos');
  };

  const filtered = alertas.filter((a) => {
    if (filterFechaInicio && new Date(a.created_at) < new Date(filterFechaInicio)) return false;
    if (filterFechaFin) {
      const end = new Date(filterFechaFin);
      end.setHours(23, 59, 59, 999);
      if (new Date(a.created_at) > end) return false;
    }
    if (filterUsuario && String(a.usuario_id) !== filterUsuario) return false;
    if (filterTipo && a.tipo !== filterTipo) return false;
    if (filterEstado === 'activa' && !a.activa) return false;
    if (filterEstado === 'cerrada' && a.activa) return false;
    return true;
  });

  const hasFilters = filterFechaInicio || filterFechaFin || filterUsuario || filterTipo || filterEstado !== 'todos';

  // ── Analytics calculations ──
  const totalAlertas = alertas.length;
  const alertasActivas = alertas.filter(a => a.activa).length;
  const alertasCerradas = alertas.filter(a => !a.activa).length;

  const porTipo = alertas.reduce((acc, a) => {
    acc[a.tipo] = (acc[a.tipo] || 0) + 1;
    return acc;
  }, {});

  const porUsuario = alertas.reduce((acc, a) => {
    const nombre = a.app_usuarios?.nombre || `Usuario #${a.usuario_id}`;
    if (!acc[nombre]) acc[nombre] = { nombre, count: 0, tipos: {} };
    acc[nombre].count += 1;
    acc[nombre].tipos[a.tipo] = (acc[nombre].tipos[a.tipo] || 0) + 1;
    return acc;
  }, {});
  const rankingUsuarios = Object.values(porUsuario).sort((a, b) => b.count - a.count);

  const porTerritorio = {};
  alertas.forEach(a => {
    const terr = findTerritorio(a.latitud, a.longitud, territorios);
    const terrNombre = terr?.nombre || 'Sin territorio';
    if (!porTerritorio[terrNombre]) {
      porTerritorio[terrNombre] = { nombre: terrNombre, total: 0, tipos: {} };
    }
    porTerritorio[terrNombre].total += 1;
    porTerritorio[terrNombre].tipos[a.tipo] = (porTerritorio[terrNombre].tipos[a.tipo] || 0) + 1;
  });
  const rankingTerritorios = Object.values(porTerritorio).sort((a, b) => b.total - a.total);

  const porMes = {};
  const ahora = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const key = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
    porMes[key] = 0;
  }
  alertas.forEach(a => {
    const d = new Date(a.created_at);
    const key = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
    if (porMes[key] !== undefined) porMes[key] += 1;
  });

  // Detalle por mes: quién mandó alertas y en qué territorio
  const detallePorMes = {};
  alertas.forEach(a => {
    const d = new Date(a.created_at);
    const key = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
    if (!detallePorMes[key]) detallePorMes[key] = [];
    const terr = findTerritorio(a.latitud, a.longitud, territorios);
    detallePorMes[key].push({
      nombre: a.app_usuarios?.nombre || `Usuario #${a.usuario_id}`,
      tipo: TYPE_CONFIG[a.tipo]?.label || a.tipo,
      territorio: terr?.nombre || 'Sin territorio',
    });
  });

  const tiempos = alertas
    .filter(a => a.cerrada_at)
    .map(a => (new Date(a.cerrada_at) - new Date(a.created_at)) / 1000 / 60);
  const tiempoPromedio = tiempos.length > 0
    ? (tiempos.reduce((s, t) => s + t, 0) / tiempos.length).toFixed(1)
    : 0;

  const totalResponses = alertas.reduce((sum, a) => {
    return sum + (Array.isArray(a.respondieron) ? a.respondieron.length : 0);
  }, 0);

  // ── KPI Cards ──
  const kpiCards = [
    {
      label: tx('Total Alertas'),
      value: totalAlertas,
      sub: tx(alertasActivas === 1 ? '{n} activa ahora' : '{n} activas ahora', { n: alertasActivas }),
      icon: <Bell size={22} style={{ color: '#EF4444' }} />,
      gradient: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      accent: '#EF4444',
    },
    {
      label: tx('Cerradas'),
      value: alertasCerradas,
      sub: tx('Alertas resueltas'),
      icon: <Shield size={22} style={{ color: '#059669' }} />,
      gradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
      accent: '#059669',
    },
    {
      label: tx('Tiempo Prom.'),
      value: `${tiempoPromedio}`,
      sub: tx('Minutos de respuesta'),
      icon: <Activity size={22} style={{ color: '#2563EB' }} />,
      gradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      accent: '#2563EB',
    },
    {
      label: tx('Respuestas'),
      value: totalResponses,
      sub: tx('"Voy en camino" totales'),
      icon: <TrendingUp size={22} style={{ color: '#D97706' }} />,
      gradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
      accent: '#D97706',
    },
  ];

  // ── Chart data ──
  const tipoLabels = Object.keys(porTipo);
  const tipoValues = Object.values(porTipo);
  const TIPO_COLORS = {
    seguridad: { hex: '#EF4444', bg: 'rgba(239,68,68,0.7)' },
    medica:    { hex: '#3B82F6', bg: 'rgba(59,130,246,0.7)' },
    accidente: { hex: '#F97316', bg: 'rgba(249,115,22,0.7)' },
  };

  const donutAlertData = {
    labels: tipoLabels.map(t => tx(TYPE_CONFIG[t]?.label || t)),
    datasets: [{
      data: tipoValues,
      backgroundColor: tipoLabels.map(t => TIPO_COLORS[t]?.bg || 'rgba(156,163,175,0.7)'),
      borderColor: tipoLabels.map(t => TIPO_COLORS[t]?.hex || '#9CA3AF'),
      borderWidth: 2,
      hoverOffset: 18,
    }],
  };

  const barAlertData = {
    labels: Object.keys(porMes),
    datasets: [{
      label: tx('Alertas'),
      data: Object.values(porMes),
      backgroundColor: 'rgba(239,68,68,0.8)',
      borderRadius: 7,
      borderSkipped: false,
    }],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 16, font: { size: 12, weight: '600' }, usePointStyle: true, pointStyleWidth: 8 },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0F172A',
        bodyColor: '#475569',
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${totalAlertas > 0 ? ((ctx.parsed / totalAlertas) * 100).toFixed(1) : 0}%)`,
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0F172A',
        bodyColor: '#475569',
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8' } },
      y: { grid: { color: CH_GRID }, ticks: { font: { size: 11 }, color: '#94A3B8', stepSize: 1 }, beginAtZero: true },
    },
  };

  const barTerrData = {
    labels: rankingTerritorios.map(t => t.nombre),
    datasets: [
      {
        label: tx('Seguridad'),
        data: rankingTerritorios.map(t => t.tipos.seguridad || 0),
        backgroundColor: 'rgba(239,68,68,0.8)',
        borderRadius: 5,
        borderSkipped: false,
      },
      {
        label: tx('Médica'),
        data: rankingTerritorios.map(t => t.tipos.medica || 0),
        backgroundColor: 'rgba(59,130,246,0.8)',
        borderRadius: 5,
        borderSkipped: false,
      },
      {
        label: tx('Accidente'),
        data: rankingTerritorios.map(t => t.tipos.accidente || 0),
        backgroundColor: 'rgba(249,115,22,0.8)',
        borderRadius: 5,
        borderSkipped: false,
      },
    ],
  };

  const barTerrOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0F172A',
        bodyColor: '#475569',
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          afterBody: (items) => {
            const idx = items[0].dataIndex;
            const terr = rankingTerritorios[idx];
            return [
              `───────────`,
              `Total: ${terr.total} alertas`,
              ...Object.entries(terr.tipos).map(([tipo, count]) =>
                `${TYPE_CONFIG[tipo]?.label || tipo}: ${count}`
              ),
            ];
          },
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: CH_GRID }, ticks: { stepSize: 1, font: { size: 11 }, color: '#94A3B8' }, beginAtZero: true },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: CH_LABEL } },
    },
  };

  const lineData = {
    labels: Object.keys(porMes),
    datasets: [{
      label: tx('Alertas'),
      data: Object.values(porMes),
      borderColor: '#EF4444',
      backgroundColor: 'rgba(239,68,68,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#EF4444',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 8,
    }],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0F172A',
        bodyColor: '#475569',
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 11 },
        callbacks: {
          title: (items) => {
            return `📅 ${items[0].label}`;
          },
          label: (ctx) => {
            return ` Total: ${ctx.raw} alerta${ctx.raw !== 1 ? 's' : ''}`;
          },
          afterBody: (items) => {
            const mesKey = items[0].label;
            const detalles = detallePorMes[mesKey] || [];
            if (detalles.length === 0) return [];
            const lines = ['', '── Detalle ──'];
            // Agrupar por persona
            const porPersona = {};
            detalles.forEach(d => {
              if (!porPersona[d.nombre]) porPersona[d.nombre] = [];
              porPersona[d.nombre].push(`${d.tipo} → ${d.territorio}`);
            });
            Object.entries(porPersona).forEach(([nombre, alertasArr]) => {
              lines.push(`👤 ${nombre} (${alertasArr.length})`);
              alertasArr.forEach(info => {
                lines.push(`   • ${info}`);
              });
            });
            return lines;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8' } },
      y: { grid: { color: CH_GRID }, ticks: { font: { size: 11 }, color: '#94A3B8', stepSize: 1 }, beginAtZero: true },
    },
  };

  // ── Reporte (Excel, PDF y reporte interactivo con el mismo modelo: utils/reportes) ──
  const armarReporte = () => {
    const COLOR_TIPO_ALERTA = { Seguridad: '#DC2626', 'Médica': '#2563EB', Accidente: '#EA580C' };
    const tipos = ['seguridad', 'medica', 'accidente'];
    const filtros = [
      filterFechaInicio && `desde ${filterFechaInicio}`,
      filterFechaFin && `hasta ${filterFechaFin}`,
      filterTipo && (TYPE_CONFIG[filterTipo]?.label || filterTipo),
      filterEstado !== 'todos' && (filterEstado === 'activa' ? 'activas' : 'cerradas'),
      filterUsuario && (alertas.find(a => String(a.usuario_id) === filterUsuario)?.app_usuarios?.nombre || `usuario #${filterUsuario}`),
    ].filter(Boolean);
    return {
      archivo: `Reporte_Alertas_${new Date().toISOString().slice(0, 10)}`,
      titulo: 'Reporte de alertas de emergencia',
      subtitulo: user?.congregacion_nombre || 'Todas las congregaciones',
      usuario: user?.nombre,
      color: '#DC2626',
      meta: filtros.length ? [{ etiqueta: 'Detalle filtrado', valor: filtros.join(', ') }] : [],
      kpis: [
        { etiqueta: 'Total de alertas', valor: totalAlertas, detalle: 'Desde que hay registro', color: '#DC2626' },
        { etiqueta: 'Activas', valor: alertasActivas, detalle: 'Sin cerrar', color: '#EA580C' },
        { etiqueta: 'Cerradas', valor: alertasCerradas, detalle: 'Atendidas', color: '#059669' },
        { etiqueta: 'Respuesta promedio', valor: `${tiempoPromedio} min`, detalle: 'De la alerta al cierre', color: '#2563EB' },
        { etiqueta: '"Voy en camino"', valor: totalResponses, detalle: 'Respuestas de hermanos', color: '#7C3AED' },
      ],
      secciones: [
        {
          tipo: 'grafica', titulo: 'Por tipo de emergencia', en: ['pdf', 'html'],
          grafica: { tipo: 'dona', etiquetas: tipos.map(t => TYPE_CONFIG[t].label), series: [{ nombre: 'Alertas', valores: tipos.map(t => porTipo[t] || 0) }], colores: tipos.map(t => COLOR_TIPO_ALERTA[TYPE_CONFIG[t].label]), unidad: 'alertas' },
        },
        {
          tipo: 'grafica', titulo: 'Alertas por mes (últimos 6 meses)', en: ['pdf', 'html'],
          grafica: { tipo: 'lineas', etiquetas: Object.keys(porMes), series: [{ nombre: 'Alertas', valores: Object.values(porMes), color: '#DC2626' }] },
        },
        rankingTerritorios.length > 0 && {
          tipo: 'grafica', titulo: 'Alertas por territorio', en: ['pdf', 'html'],
          grafica: { tipo: 'barrasH', etiquetas: rankingTerritorios.map(t => t.nombre), series: [{ nombre: 'Alertas', valores: rankingTerritorios.map(t => t.total), color: '#EF4444' }] },
        },
        {
          tipo: 'tabla', titulo: 'Alertas por usuario', hoja: 'Por usuario',
          columnas: [
            { titulo: '#', clave: 'n', tipo: 'numero', ancho: 6 },
            { titulo: 'Usuario', clave: 'nombre' },
            { titulo: 'Total', clave: 'count', tipo: 'numero' },
            { titulo: 'Seguridad', clave: 'seguridad', tipo: 'numero' },
            { titulo: 'Médica', clave: 'medica', tipo: 'numero' },
            { titulo: 'Accidente', clave: 'accidente', tipo: 'numero' },
          ],
          filas: rankingUsuarios.map((u, i) => ({ n: i + 1, nombre: u.nombre, count: u.count, seguridad: u.tipos.seguridad || 0, medica: u.tipos.medica || 0, accidente: u.tipos.accidente || 0 })),
          totales: { n: '', nombre: 'Total', count: 'suma', seguridad: 'suma', medica: 'suma', accidente: 'suma' },
        },
        {
          tipo: 'tabla', titulo: 'Territorios: alertas por tipo', hoja: 'Por territorio',
          columnas: [
            { titulo: 'Territorio', clave: 'nombre' },
            { titulo: 'Total', clave: 'total', tipo: 'numero' },
            { titulo: 'Seguridad', clave: 'seguridad', tipo: 'numero' },
            { titulo: 'Médica', clave: 'medica', tipo: 'numero' },
            { titulo: 'Accidente', clave: 'accidente', tipo: 'numero' },
          ],
          filas: rankingTerritorios.map(t => ({ nombre: t.nombre, total: t.total, seguridad: t.tipos.seguridad || 0, medica: t.tipos.medica || 0, accidente: t.tipos.accidente || 0 })),
          totales: { total: 'suma', seguridad: 'suma', medica: 'suma', accidente: 'suma' },
        },
        {
          tipo: 'tabla', titulo: 'Detalle de alertas', hoja: 'Detalle', color: '#1E293B',
          descripcion: filtros.length ? `Con los filtros: ${filtros.join(', ')}.` : undefined,
          columnas: [
            { titulo: 'Fecha', clave: 'fecha', tipo: 'fechaHora' },
            { titulo: 'Usuario', clave: 'usuario' },
            { titulo: 'Tipo', clave: 'tipo', colores: COLOR_TIPO_ALERTA },
            { titulo: 'Estado', clave: 'estado', colores: { Activa: '#DC2626', Cerrada: '#059669' } },
            { titulo: 'Territorio', clave: 'territorio' },
            { titulo: 'Mensaje', clave: 'mensaje', anchoPDF: 38 },
            { titulo: 'Respondieron', clave: 'respondieron', anchoPDF: 30 },
            { titulo: 'Cerrada', clave: 'cerrada', tipo: 'fechaHora', en: ['excel', 'html'] },
            { titulo: 'Latitud', clave: 'latitud', tipo: 'decimal', ancho: 12, en: ['excel'] },
            { titulo: 'Longitud', clave: 'longitud', tipo: 'decimal', ancho: 12, en: ['excel'] },
          ],
          filas: filtered.map(a => ({
            fecha: a.created_at,
            usuario: a.app_usuarios?.nombre || `#${a.usuario_id}`,
            tipo: TYPE_CONFIG[a.tipo]?.label || a.tipo,
            estado: a.activa ? 'Activa' : 'Cerrada',
            territorio: findTerritorio(a.latitud, a.longitud, territorios)?.nombre || 'Sin territorio',
            mensaje: a.mensaje || '',
            respondieron: Array.isArray(a.respondieron) ? a.respondieron.map(r => r.nombre).join(', ') : '',
            cerrada: a.cerrada_at,
            latitud: a.latitud,
            longitud: a.longitud,
          })),
        },
      ].filter(Boolean),
    };
  };

  return (
    <div className="mx-auto w-full animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Bell size={20} style={{ color: '#F87171' }} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">{tx('Historial de Alertas')}</h1>
            <p className="text-sm mt-0.5 text-secondary">{tx('Analytics y registro completo de alertas')}</p>
          </div>
        </div>
        <BotonesExportar armar={armarReporte} clase="btn btn-secondary text-sm" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className="kpi-card rounded-2xl p-4 sm:p-5 cursor-default transition-all duration-250 hover:-translate-y-1"
            style={{
              '--accent': k.accent,
              background: k.gradient,
              border: `1px solid ${k.accent}30`,
              borderTop: `3px solid ${k.accent}`,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${k.accent}20` }}>
                {k.icon}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{tx(k.label)}</p>
              <p className="num-display text-3xl sm:text-4xl font-black leading-none my-1.5 tabular-nums text-primary">{k.value}</p>
              <p className="text-xs font-semibold" style={{ color: k.accent }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#EF4444' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Por Tipo de Emergencia')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Doughnut ref={chartDonutRef} data={donutAlertData} options={donutOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin alertas registradas')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F97316' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Alertas por Mes')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Bar ref={chartBarRef} data={barAlertData} options={barOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin datos')}</p>}
          </div>
        </div>
      </div>

      {/* Nuevos gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#DC2626' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Alertas por Territorio')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {rankingTerritorios.length > 0
              ? <Bar ref={chartTerrRef} data={barTerrData} options={barTerrOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin datos')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Tendencia de Alertas')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Line ref={chartLineRef} data={lineData} options={lineOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin datos')}</p>}
          </div>
        </div>
      </div>

      {/* Ranking de usuarios */}
      {rankingUsuarios.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#DC2626' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Ranking de Reportes por Usuario')}</h3>
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              {rankingUsuarios.length} usuario{rankingUsuarios.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2.5">
            {rankingUsuarios.slice(0, 10).map((u, i) => {
              const pct = totalAlertas > 0 ? ((u.count / totalAlertas) * 100).toFixed(0) : 0;
              const barColor = i === 0 ? '#EF4444' : i === 1 ? '#F97316' : i === 2 ? '#F59E0B' : '#94A3B8';
              return (
                <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: barColor }}>
                        {i + 1}
                      </span>
                      <span className="font-bold text-sm text-primary">{u.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums text-secondary">{u.count} alerta{u.count !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full" style={{ background: `${barColor}20`, color: barColor }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {Object.entries(u.tipos).map(([tipo, count]) => (
                      <span key={tipo} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{
                        background: tipo === 'seguridad' ? 'rgba(239,68,68,0.1)' : tipo === 'medica' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                        color: tipo === 'seguridad' ? '#EF4444' : tipo === 'medica' ? '#3B82F6' : '#F97316',
                      }}>
                        {tx(TYPE_CONFIG[tipo]?.label || tipo)}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: '#3B82F6' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3B82F6' }}>{tx('Filtros')}</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs transition-colors text-secondary"
            >
              <X size={12} /> {tx('Limpiar')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#3B82F6' }}>{tx('Fecha inicio')}</label>
            <input
              type="date"
              value={filterFechaInicio}
              onChange={(e) => setFilterFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#3B82F6' }}>{tx('Fecha fin')}</label>
            <input
              type="date"
              value={filterFechaFin}
              onChange={(e) => setFilterFechaFin(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#8B5CF6' }}>{tx('Usuario')}</label>
            <select
              value={filterUsuario}
              onChange={(e) => setFilterUsuario(e.target.value)}
            >
              <option value="">{tx('Todos')}</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#F59E0B' }}>{tx('Tipo')}</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
            >
              <option value="">{tx('Todos')}</option>
              <option value="seguridad">{tx('Seguridad')}</option>
              <option value="medica">{tx('Médica')}</option>
              <option value="accidente">{tx('Accidente')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#10B981' }}>{tx('Estado')}</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="todos">{tx('Todos')}</option>
              <option value="activa">{tx('Activas')}</option>
              <option value="cerrada">{tx('Cerradas')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="card p-4 mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: '#EF4444', marginTop: 2 }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#DC2626' }}>{tx('Error al cargar alertas')}</p>
              <p className="text-xs mt-1" style={{ color: '#FCA5A5' }}>{fetchError}</p>
              <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
                {tx('Si el error es de permisos (RLS): en Supabase → tabla alertas_panico → Authentication → Policies, agrega una policy "Enable read access for all users" con USING (true), o desactiva RLS en esta tabla.')}
              </p>
              <button
                onClick={fetchAlertas}
                className="mt-3 btn btn-primary text-xs px-4 py-2"
              >
                {tx('Reintentar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-lg sm:text-xl font-bold mb-4 px-1 text-primary">
        {loading ? (
          <span style={{ color: '#60A5FA' }}>{tx('Cargando...')}</span>
        ) : (
          <>
            <span style={{ color: '#3B82F6' }}>{filtered.length}</span>{' '}
            alerta{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
          </>
        )}
      </p>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <Bell size={40} className="mx-auto mb-3 opacity-20 text-secondary" />
          <p className="font-medium text-muted">No hay alertas{hasFilters ? ' con esos filtros' : ''}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((alerta) => (
            <AlertCard key={alerta.id} alerta={alerta} territorios={territorios} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PanicHistory;
