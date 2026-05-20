/**
 * NOTA: Si las alertas no se muestran, verificar en Supabase Dashboard:
 * 1. Tabla alertas_panico → Authentication → RLS debe estar OFF
 *    (o tener policy: CREATE POLICY "anon_all" ON alertas_panico FOR ALL USING (true) WITH CHECK (true))
 * 2. La relación con app_usuarios debe existir (FK usuario_id → app_usuarios.id)
 * 3. Verificar en consola del navegador los logs [PanicHistory]
 */
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip as ChartTooltip, Legend, Title,
  PointElement, LineElement, Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Bell, MapPin, Clock, User, Filter, X, ExternalLink, FileText, Table, Shield, Activity, TrendingUp, AlertTriangle } from 'lucide-react';

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
      {cfg.label}
    </span>
  );
};

const StatusBadge = ({ activa }) => {
  if (activa) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
        Activa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-600 text-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
      Cerrada
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
              <p className="font-bold text-sm leading-tight" style={{ color: '#1E293B' }}>
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
                <span style={{ color: '#64748B', fontWeight: 500 }}>· {territorio.responsable}</span>
              )}
            </span>
          </div>
        )}

        {/* Mensaje */}
        {alerta.mensaje && (
          <p className="mt-3 text-sm rounded-xl px-3 py-2.5 leading-relaxed" style={{
            color: '#334155',
            background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.07)',
          }}>
            {alerta.mensaje}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5" style={{ color: '#64748B' }}>
            <Clock size={12} style={{ color: '#2563EB' }} />
            {formatDate(alerta.created_at)}
          </span>
          {duracion && (
            <span className="flex items-center gap-1.5" style={{ color: '#64748B' }}>
              <Clock size={12} style={{ color: '#2563EB' }} />
              Duración: <strong style={{ color: '#D97706' }}>{duracion}</strong>
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
            </MapContainer>
          </div>
        )}

        {/* Respondedores */}
        {respondieron.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
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
      label: 'Total Alertas',
      value: totalAlertas,
      sub: `${alertasActivas} activa${alertasActivas !== 1 ? 's' : ''} ahora`,
      icon: <Bell size={22} style={{ color: '#EF4444' }} />,
      gradient: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      accent: '#EF4444',
    },
    {
      label: 'Cerradas',
      value: alertasCerradas,
      sub: 'Alertas resueltas',
      icon: <Shield size={22} style={{ color: '#059669' }} />,
      gradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
      accent: '#059669',
    },
    {
      label: 'Tiempo Prom.',
      value: `${tiempoPromedio}`,
      sub: 'Minutos de respuesta',
      icon: <Activity size={22} style={{ color: '#2563EB' }} />,
      gradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      accent: '#2563EB',
    },
    {
      label: 'Respuestas',
      value: totalResponses,
      sub: '"Voy en camino" totales',
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
    labels: tipoLabels.map(t => TYPE_CONFIG[t]?.label || t),
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
      label: 'Alertas',
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
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94A3B8', stepSize: 1 }, beginAtZero: true },
    },
  };

  const barTerrData = {
    labels: rankingTerritorios.map(t => t.nombre),
    datasets: [
      {
        label: 'Seguridad',
        data: rankingTerritorios.map(t => t.tipos.seguridad || 0),
        backgroundColor: 'rgba(239,68,68,0.8)',
        borderRadius: 5,
        borderSkipped: false,
      },
      {
        label: 'Médica',
        data: rankingTerritorios.map(t => t.tipos.medica || 0),
        backgroundColor: 'rgba(59,130,246,0.8)',
        borderRadius: 5,
        borderSkipped: false,
      },
      {
        label: 'Accidente',
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
      x: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1, font: { size: 11 }, color: '#94A3B8' }, beginAtZero: true },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#475569' } },
    },
  };

  const lineData = {
    labels: Object.keys(porMes),
    datasets: [{
      label: 'Alertas',
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
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94A3B8', stepSize: 1 }, beginAtZero: true },
    },
  };

  // ── Export functions ──
  const generateAlertPDF = () => {
    const doc = new jsPDF('p', 'mm', 'letter');
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFillColor(127, 29, 29);
    doc.rect(0, 0, pageW, 42, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Alertas de Emergencia', pageW / 2, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Gestión Territorial JW — Historial de Pánico', pageW / 2, 27, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}  |  Usuario: ${user?.nombre || 'N/A'}`, pageW / 2, 36, { align: 'center' });
    y = 52;

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Resumen de Alertas', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: [
        ['Total de Alertas', String(totalAlertas)],
        ['Alertas Activas', String(alertasActivas)],
        ['Alertas Cerradas', String(alertasCerradas)],
        ['Tiempo Prom. Respuesta', `${tiempoPromedio} min`],
        ['Total Respuestas "Voy en camino"', String(totalResponses)],
        ['Seguridad', String(porTipo.seguridad || 0)],
        ['Médica', String(porTipo.medica || 0)],
        ['Accidente', String(porTipo.accidente || 0)],
      ],
      headStyles: { fillColor: [185, 28, 28], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { font: 'helvetica', fontSize: 9 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 4 },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Ranking de Reportes por Usuario', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Usuario', 'Total Alertas', 'Seguridad', 'Médica', 'Accidente']],
      body: rankingUsuarios.map((u, i) => [
        i + 1, u.nombre, u.count,
        u.tipos.seguridad || 0, u.tipos.medica || 0, u.tipos.accidente || 0,
      ]),
      headStyles: { fillColor: [220, 38, 38], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { font: 'helvetica', fontSize: 9 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 4 },
    });
    y = doc.lastAutoTable.finalY + 10;

    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Detalle de Alertas', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Usuario', 'Tipo', 'Estado', 'Territorio', 'Mensaje', 'Respondieron']],
      body: filtered.map(a => {
        const terr = findTerritorio(a.latitud, a.longitud, territorios);
        return [
          formatDate(a.created_at),
          a.app_usuarios?.nombre || `#${a.usuario_id}`,
          TYPE_CONFIG[a.tipo]?.label || a.tipo,
          a.activa ? 'Activa' : 'Cerrada',
          terr?.nombre || 'Sin territorio',
          a.mensaje || '—',
          Array.isArray(a.respondieron) ? a.respondieron.map(r => r.nombre).join(', ') : '—',
        ];
      }),
      headStyles: { fillColor: [31, 41, 55], font: 'helvetica', fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { font: 'helvetica', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 3 },
      columnStyles: { 5: { cellWidth: 40 }, 6: { cellWidth: 30 } },
    });

    // Gráfico Donut (Por Tipo)
    if (chartDonutRef.current) {
      doc.addPage(); y = 20;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('4. Gráfico: Alertas por Tipo de Emergencia', 14, y);
      y += 4;
      const donutImg = chartDonutRef.current.toBase64Image();
      doc.addImage(donutImg, 'PNG', 30, y, pageW - 60, 80);
      y += 88;
    }

    // Gráfico Bar Mensual
    if (chartBarRef.current) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('5. Gráfico: Alertas por Mes', 14, y);
      y += 4;
      const barImg = chartBarRef.current.toBase64Image();
      doc.addImage(barImg, 'PNG', 14, y, pageW - 28, 80);
      y += 88;
    }

    // Gráfico Bar Territorios
    if (chartTerrRef.current) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('6. Gráfico: Alertas por Territorio', 14, y);
      y += 4;
      const terrImg = chartTerrRef.current.toBase64Image();
      doc.addImage(terrImg, 'PNG', 14, y, pageW - 28, 80);
      y += 88;
    }

    // Gráfico Línea Tendencia
    if (chartLineRef.current) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('7. Gráfico: Tendencia de Alertas', 14, y);
      y += 4;
      const lineImg = chartLineRef.current.toBase64Image();
      doc.addImage(lineImg, 'PNG', 14, y, pageW - 28, 80);
      y += 88;
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text('Gestión Territorial JW  |  Reporte de Alertas', pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }
    doc.save(`Reporte_Alertas_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generateAlertExcel = () => {
    const wb = XLSX.utils.book_new();

    const resumen = [
      ['Indicador', 'Valor'],
      ['Total Alertas', totalAlertas],
      ['Activas', alertasActivas],
      ['Cerradas', alertasCerradas],
      ['Tiempo Prom. Respuesta (min)', tiempoPromedio],
      ['Total Respuestas', totalResponses],
      ['Tipo Seguridad', porTipo.seguridad || 0],
      ['Tipo Médica', porTipo.medica || 0],
      ['Tipo Accidente', porTipo.accidente || 0],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumen);
    ws1['!cols'] = [{ wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    const headers = ['Fecha', 'Usuario', 'Tipo', 'Estado', 'Territorio', 'Mensaje', 'Latitud', 'Longitud', 'Cerrada', 'Respondieron'];
    const rows = filtered.map(a => {
      const terr = findTerritorio(a.latitud, a.longitud, territorios);
      return [
        formatDate(a.created_at),
        a.app_usuarios?.nombre || `#${a.usuario_id}`,
        TYPE_CONFIG[a.tipo]?.label || a.tipo,
        a.activa ? 'Activa' : 'Cerrada',
        terr?.nombre || 'Sin territorio',
        a.mensaje || '',
        a.latitud || '',
        a.longitud || '',
        a.cerrada_at ? formatDate(a.cerrada_at) : '',
        Array.isArray(a.respondieron) ? a.respondieron.map(r => r.nombre).join(', ') : '',
      ];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws2['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Alertas');

    const rankHeaders = ['#', 'Usuario', 'Total', 'Seguridad', 'Médica', 'Accidente'];
    const rankRows = rankingUsuarios.map((u, i) => [
      i + 1, u.nombre, u.count,
      u.tipos.seguridad || 0, u.tipos.medica || 0, u.tipos.accidente || 0,
    ]);
    const ws3 = XLSX.utils.aoa_to_sheet([rankHeaders, ...rankRows]);
    ws3['!cols'] = rankHeaders.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Ranking Usuarios');

    XLSX.writeFile(wb, `Alertas_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Historial de Alertas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Analytics y registro completo de alertas</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={generateAlertPDF} className="btn btn-primary flex items-center gap-2">
            <FileText size={15} /> PDF
          </button>
          <button onClick={generateAlertExcel} className="btn btn-secondary flex items-center gap-2">
            <Table size={15} /> Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 sm:p-5 cursor-default transition-all duration-250 hover:-translate-y-1"
            style={{
              background: k.gradient,
              border: `1px solid ${k.accent}30`,
              borderTop: `3px solid ${k.accent}`,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${k.accent}20` }}>
                {k.icon}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{k.label}</p>
              <p className="num-display text-3xl sm:text-4xl font-black leading-none my-1.5 tabular-nums" style={{ color: '#0F172A' }}>{k.value}</p>
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
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Por Tipo de Emergencia</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Doughnut ref={chartDonutRef} data={donutAlertData} options={donutOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin alertas registradas</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F97316' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Alertas por Mes</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Bar ref={chartBarRef} data={barAlertData} options={barOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin datos</p>}
          </div>
        </div>
      </div>

      {/* Nuevos gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#DC2626' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Alertas por Territorio</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {rankingTerritorios.length > 0
              ? <Bar ref={chartTerrRef} data={barTerrData} options={barTerrOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin datos</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Tendencia de Alertas</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalAlertas > 0
              ? <Line ref={chartLineRef} data={lineData} options={lineOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin datos</p>}
          </div>
        </div>
      </div>

      {/* Ranking de usuarios */}
      {rankingUsuarios.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#DC2626' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Ranking de Reportes por Usuario</h3>
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              {rankingUsuarios.length} usuario{rankingUsuarios.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2.5">
            {rankingUsuarios.slice(0, 10).map((u, i) => {
              const pct = totalAlertas > 0 ? ((u.count / totalAlertas) * 100).toFixed(0) : 0;
              const barColor = i === 0 ? '#EF4444' : i === 1 ? '#F97316' : i === 2 ? '#F59E0B' : '#94A3B8';
              return (
                <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: barColor }}>
                        {i + 1}
                      </span>
                      <span className="font-bold text-sm" style={{ color: '#0F172A' }}>{u.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: '#475569' }}>{u.count} alerta{u.count !== 1 ? 's' : ''}</span>
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
                        {TYPE_CONFIG[tipo]?.label || tipo}: {count}
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
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3B82F6' }}>Filtros</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#475569' }}
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#3B82F6' }}>Fecha inicio</label>
            <input
              type="date"
              value={filterFechaInicio}
              onChange={(e) => setFilterFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#3B82F6' }}>Fecha fin</label>
            <input
              type="date"
              value={filterFechaFin}
              onChange={(e) => setFilterFechaFin(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#8B5CF6' }}>Usuario</label>
            <select
              value={filterUsuario}
              onChange={(e) => setFilterUsuario(e.target.value)}
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#F59E0B' }}>Tipo</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="seguridad">Seguridad</option>
              <option value="medica">Médica</option>
              <option value="accidente">Accidente</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#10B981' }}>Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="activa">Activas</option>
              <option value="cerrada">Cerradas</option>
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
              <p className="text-sm font-bold" style={{ color: '#DC2626' }}>Error al cargar alertas</p>
              <p className="text-xs mt-1" style={{ color: '#FCA5A5' }}>{fetchError}</p>
              <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
                Si el error es de permisos (RLS), ve al dashboard de Supabase → tabla <code style={{ color: '#60A5FA' }}>alertas_panico</code> → Authentication → Policies,
                y agrega una policy "Enable read access for all users" con <code style={{ color: '#60A5FA' }}>USING (true)</code>.
                O desactiva RLS en esta tabla si tu autenticación es custom.
              </p>
              <button
                onClick={fetchAlertas}
                className="mt-3 btn btn-primary text-xs px-4 py-2"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs font-semibold mb-3 px-1" style={{ color: '#94A3B8' }}>
        {loading ? (
          <span style={{ color: '#60A5FA' }}>Cargando...</span>
        ) : (
          <>
            <span style={{ color: '#E2E8F0' }}>{filtered.length}</span>{' '}
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
          <Bell size={40} className="mx-auto mb-3 opacity-20" style={{ color: '#64748B' }} />
          <p className="font-medium" style={{ color: '#94A3B8' }}>No hay alertas{hasFilters ? ' con esos filtros' : ''}</p>
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
