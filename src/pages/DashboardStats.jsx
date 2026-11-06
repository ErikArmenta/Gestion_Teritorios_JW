import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabaseClient';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend, Title
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Home, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import BotonesExportar from '../components/BotonesExportar';
import { useGrupos } from '../context/GruposContext';
import { getTerritoryProgress, indexarHistorial, resumenPorGrupo, conteoPorEstado, PROGRESO } from '../utils/territoryProgress';
import GruposDashboardCard from '../components/GruposDashboardCard';
import { t as tx } from '../i18n';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

const STATUS_COLORS = {
  "Atendido": { hex: "#10B981", bg: "rgba(16,185,129,0.7)" },
  "No atendió": { hex: "#EF4444", bg: "rgba(239,68,68,0.7)" },
  "Pendiente": { hex: "#F59E0B", bg: "rgba(245,158,11,0.7)" },
  "No tocar": { hex: "#1F2937", bg: "rgba(31,41,55,0.7)" },
  "Solo fines de semana": { hex: "#3B82F6", bg: "rgba(59,130,246,0.7)" }
};

const DashboardStats = () => {
  const { casas, territorios, loading } = useData();
  const { user } = useAuth();
  const { theme } = useTheme();

  // Colores de gráficas según el tema (en oscuro los grises claros no se leían)
  const oscuro = theme === 'dark';
  const CH_TEXT = oscuro ? '#CBD5E1' : '#475569';
  const CH_TICK = oscuro ? '#94A3B8' : '#64748B';
  const CH_GRID = oscuro ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  // "No tocar" es casi negro: en modo oscuro se pinta gris pizarra para que se vea
  const colorEstado = (s, campo) =>
    oscuro && s === 'No tocar'
      ? (campo === 'bg' ? 'rgba(100,116,139,0.8)' : '#94A3B8')
      : (STATUS_COLORS[s]?.[campo] || (campo === 'bg' ? 'rgba(156,163,175,0.7)' : '#9CA3AF'));

  const [actividadReciente, setActividadReciente] = useState([]);
  const [periodoActivo, setPeriodoActivo] = useState('todo');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    const fetchActividad = async () => {
      const { data, error } = await supabase
        .from('historial_visitas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);
      if (!error && data) setActividadReciente(data);
    };
    fetchActividad();
  }, []);

  const getPeriodRange = (periodo) => {
    const now = new Date();
    const toDateStr = (d) => d.toISOString().slice(0, 10);
    switch (periodo) {
      case 'hoy': {
        const today = toDateStr(now);
        return { desde: today, hasta: today };
      }
      case 'semana': {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return { desde: toDateStr(d), hasta: toDateStr(now) };
      }
      case 'mes': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        return { desde: toDateStr(first), hasta: toDateStr(now) };
      }
      case 'trimestre': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return { desde: toDateStr(d), hasta: toDateStr(now) };
      }
      default:
        return { desde: '', hasta: '' };
    }
  };

  const handlePeriodo = (periodo) => {
    setPeriodoActivo(periodo);
    if (periodo === 'todo') {
      setFechaDesde('');
      setFechaHasta('');
    } else {
      const { desde, hasta } = getPeriodRange(periodo);
      setFechaDesde(desde);
      setFechaHasta(hasta);
    }
  };

  const formatRelative = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} días`;
  };


  const chartDonutRef = useRef(null);

  // ── Progreso de territorios y grupos de predicación ──
  const { disponible: gruposDisponibles, grupos, trabajos, miembros, historial } = useGrupos();
  const progresoTerritorios = useMemo(() => {
    const ctx = { disponible: !!gruposDisponibles, trabajos, grupos, historialIdx: indexarHistorial(historial) };
    const map = {};
    territorios.forEach(terr => { map[terr.id] = getTerritoryProgress(terr, casas, ctx); });
    return map;
  }, [territorios, casas, gruposDisponibles, trabajos, grupos, historial]);
  const conteoTerritorios = useMemo(() => conteoPorEstado(progresoTerritorios), [progresoTerritorios]);
  const resumenGrupos = useMemo(
    () => resumenPorGrupo({ grupos, trabajos, miembros, territorios, progreso: progresoTerritorios }),
    [grupos, trabajos, miembros, territorios, progresoTerritorios]
  );
  const chartBarRef = useRef(null);
  const chartEspRef = useRef(null);

  // Casas filtradas por período
  const casasFiltradas = (() => {
    if (periodoActivo === 'todo' && !fechaDesde && !fechaHasta) return casas;
    const tieneFecha = casas.length > 0 && casas[0].created_at;
    if (!tieneFecha) {
      if (casas.length > 0) console.warn('[DashboardStats] Las casas no tienen campo created_at. Mostrando todos los datos sin filtro de fecha.');
      return casas;
    }
    return casas.filter(c => {
      const fecha = c.created_at?.slice(0, 10);
      if (!fecha) return false;
      if (fechaDesde && fecha < fechaDesde) return false;
      if (fechaHasta && fecha > fechaHasta) return false;
      return true;
    });
  })();

  const totalCasas = casasFiltradas.length;
  const atendidos = casasFiltradas.filter(c => c.estado === 'Atendido').length;
  const noAtendidos = casasFiltradas.filter(c => c.estado === 'No atendió').length;
  const pendientes = casasFiltradas.filter(c => c.estado === 'Pendiente').length;
  const especiales = casasFiltradas.filter(c => c.tiene_caso_especial).length;
  const porcAtendidos = totalCasas > 0 ? ((atendidos / totalCasas) * 100).toFixed(1) : 0;

  const statusCounts = casasFiltradas.reduce((acc, c) => {
    acc[c.estado] = (acc[c.estado] || 0) + 1;
    return acc;
  }, {});

  const statusLabels = Object.keys(statusCounts);
  const statusValues = Object.values(statusCounts);

  const terrData = territorios.map(t => {
    const c = casasFiltradas.filter(h => String(h.territorio_id) === String(t.id));
    return {
      nombre: t.nombre,
      total: c.length,
      atendidos: c.filter(h => h.estado === 'Atendido').length,
      noAtendidos: c.filter(h => h.estado === 'No atendió').length,
      pendientes: c.filter(h => h.estado === 'Pendiente').length,
      especiales: c.filter(h => h.tiene_caso_especial).length
    };
  });

  // --- Casos Especiales Chart ---
  const especialesData = {
    labels: terrData.filter(t => t.especiales > 0).map(t => t.nombre),
    datasets: [{
      label: tx('Casos Especiales'),
      data: terrData.filter(t => t.especiales > 0).map(t => t.especiales),
      backgroundColor: 'rgba(124,58,237,0.8)',
      borderRadius: 7,
      borderSkipped: false,
    }],
  };

  const especialesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        titleFont: { size: 13, family: 'Inter', weight: '600' },
        bodyFont: { size: 12, family: 'Inter' },
        padding: 12,
        cornerRadius: 10,
        titleColor: '#0F172A',
        bodyColor: '#64748B',
        callbacks: {
          label: (ctx) => {
            const terr = terrData.find(t => t.nombre === ctx.label);
            return [
              ` Casos especiales: ${ctx.raw}`,
              ` Total casas: ${terr?.total || 0}`,
              ` % del territorio: ${terr?.total > 0 ? ((ctx.raw / terr.total) * 100).toFixed(1) : 0}%`,
            ];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: CH_TICK } },
      y: { beginAtZero: true, grid: { color: CH_GRID }, ticks: { font: { size: 11 }, color: CH_TICK, stepSize: 1 } },
    },
  };

  // --- Donut Chart ---
  const donutData = {
    labels: statusLabels.map(s => tx(s)),
    datasets: [{
      data: statusValues,
      backgroundColor: statusLabels.map(s => colorEstado(s, 'bg')),
      borderColor: statusLabels.map(s => colorEstado(s, 'hex')),
      borderWidth: 2,
      hoverOffset: 18
    }]
  };
  const CHART_TOOLTIP = {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    titleFont: { size: 13, family: 'Inter', weight: '600' },
    bodyFont: { size: 12, family: 'Inter' },
    padding: 12,
    cornerRadius: 10,
    titleColor: '#0F172A',
    bodyColor: '#64748B',
  };

  const donutOptions = {
    responsive: true, maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: CH_TEXT }
      },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw / totalCasas) * 100).toFixed(1)}%)` }
      }
    }
  };

  // --- Bar Chart ---
  const barData = {
    labels: terrData.map(t => t.nombre),
    datasets: [
      { label: tx('Atendidos'),  data: terrData.map(t => t.atendidos),   backgroundColor: 'rgba(16,185,129,0.8)',  borderRadius: 7, borderSkipped: false },
      { label: tx('No Atendió'), data: terrData.map(t => t.noAtendidos), backgroundColor: 'rgba(239,68,68,0.8)',   borderRadius: 7, borderSkipped: false },
      { label: tx('Pendientes'), data: terrData.map(t => t.pendientes),  backgroundColor: 'rgba(245,158,11,0.8)',  borderRadius: 7, borderSkipped: false }
    ]
  };
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: CH_TEXT }
      },
      tooltip: { ...CHART_TOOLTIP },
      title: { display: false }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: CH_TICK },
        border: { color: 'rgba(0,0,0,0.06)' },
      },
      y: {
        beginAtZero: true,
        grid: { color: CH_GRID, drawBorder: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: CH_TICK, stepSize: 1 },
        border: { color: 'transparent' },
      }
    }
  };

  // --- Reporte (Excel, PDF y reporte interactivo con el mismo modelo: utils/reportes) ---
  const armarReporte = () => {
    const todo = periodoActivo === 'todo' && !fechaDesde;
    const periodo = todo ? 'Todos los datos' : `${fechaDesde || '—'} al ${fechaHasta || '—'}`;
    const sufijo = todo ? new Date().toISOString().slice(0, 10) : `${fechaDesde || 'inicio'}_${fechaHasta || 'hoy'}`;
    const colorEstado = Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, v]) => [k, v.hex]));
    const casosEsp = casasFiltradas.filter(c => c.tiene_caso_especial);
    const totalT = territorios.length || 1;
    const anio = new Date().getFullYear();
    return {
      archivo: `Reporte_Territorial_${sufijo}`,
      titulo: 'Reporte de cobertura territorial',
      subtitulo: user?.congregacion_nombre || 'Todas las congregaciones',
      usuario: user?.nombre,
      meta: [{ etiqueta: 'Período', valor: periodo }],
      color: '#2563EB',
      kpis: [
        { etiqueta: 'Total de casas', valor: totalCasas.toLocaleString('es-MX'), detalle: `${territorios.length} territorios`, color: '#2563EB' },
        { etiqueta: 'Atendidas', valor: atendidos.toLocaleString('es-MX'), detalle: `${porcAtendidos}% de cobertura`, color: '#059669' },
        { etiqueta: 'Sin contacto', valor: noAtendidos.toLocaleString('es-MX'), detalle: 'No atendieron la visita', color: '#DC2626' },
        { etiqueta: 'Pendientes', valor: pendientes.toLocaleString('es-MX'), detalle: 'Por visitar', color: '#D97706' },
        { etiqueta: 'Casos especiales', valor: especiales.toLocaleString('es-MX'), detalle: 'Atención diferenciada', color: '#7C3AED' },
        { etiqueta: 'Territorios completados', valor: `${conteoTerritorios.completado} de ${territorios.length}`, detalle: `${conteoTerritorios.en_progreso} en progreso`, color: '#0891B2' },
      ],
      secciones: [
        {
          tipo: 'texto', titulo: 'Resumen',
          parrafos: [
            `Se han registrado ${totalCasas.toLocaleString('es-MX')} viviendas en ${territorios.length} territorio(s). El índice de atención es del ${porcAtendidos}%: ${atendidos} hogares atendidos, ${noAtendidos} sin contacto y ${pendientes} pendientes.`,
            `Hay ${especiales} caso(s) especial(es) que requieren atención diferenciada. De los territorios, ${conteoTerritorios.completado} están completados, ${conteoTerritorios.en_progreso} en progreso y ${conteoTerritorios.sin_trabajar} sin trabajar.`,
          ],
        },
        {
          tipo: 'grafica', titulo: 'Distribución por estado', en: ['pdf', 'html'],
          grafica: { tipo: 'dona', etiquetas: statusLabels, series: [{ nombre: 'Casas', valores: statusValues }], colores: statusLabels.map(s => colorEstado[s] || '#9CA3AF'), unidad: 'casas' },
        },
        {
          tipo: 'grafica', titulo: 'Actividad por territorio', en: ['pdf', 'html'],
          grafica: {
            tipo: 'barras', apiladas: true, etiquetas: terrData.map(t => t.nombre),
            series: [
              { nombre: 'Atendidos', valores: terrData.map(t => t.atendidos), color: '#10B981' },
              { nombre: 'No atendió', valores: terrData.map(t => t.noAtendidos), color: '#EF4444' },
              { nombre: 'Pendientes', valores: terrData.map(t => t.pendientes), color: '#F59E0B' },
            ],
          },
        },
        especiales > 0 && {
          tipo: 'grafica', titulo: 'Casos especiales por territorio', en: ['pdf', 'html'],
          grafica: { tipo: 'barrasH', etiquetas: terrData.filter(t => t.especiales > 0).map(t => t.nombre), series: [{ nombre: 'Casos especiales', valores: terrData.filter(t => t.especiales > 0).map(t => t.especiales), color: '#7C3AED' }] },
        },
        {
          tipo: 'tabla', titulo: 'Desglose por territorio', hoja: 'Por territorio',
          columnas: [
            { titulo: 'Territorio', clave: 'nombre' },
            { titulo: 'Casas', clave: 'total', tipo: 'numero' },
            { titulo: 'Atendidos', clave: 'atendidos', tipo: 'numero' },
            { titulo: 'No atendió', clave: 'noAtendidos', tipo: 'numero' },
            { titulo: 'Pendientes', clave: 'pendientes', tipo: 'numero' },
            { titulo: 'Especiales', clave: 'especiales', tipo: 'numero' },
            { titulo: 'Cobertura', clave: 'cobertura', tipo: 'porcentaje' },
            { titulo: 'Progreso', clave: 'progreso', colores: { 'Completado': '#059669', 'En progreso': '#D97706', 'Sin trabajar': '#64748B' } },
          ],
          filas: terrData.map((t, i) => ({
            ...t,
            cobertura: t.total ? t.atendidos / t.total : 0,
            progreso: PROGRESO[progresoTerritorios[territorios[i]?.id]?.estado]?.label || '',
          })),
          totales: { total: 'suma', atendidos: 'suma', noAtendidos: 'suma', pendientes: 'suma', especiales: 'suma', cobertura: totalCasas ? atendidos / totalCasas : 0 },
        },
        {
          tipo: 'tabla', titulo: 'Casas por estado de visita', hoja: 'Por estado',
          columnas: [
            { titulo: 'Estado', clave: 'estado', colores: colorEstado },
            { titulo: 'Casas', clave: 'casas', tipo: 'numero' },
            { titulo: 'Porcentaje', clave: 'porcentaje', tipo: 'porcentaje' },
          ],
          filas: statusLabels.map((s, i) => ({ estado: s, casas: statusValues[i], porcentaje: totalCasas ? statusValues[i] / totalCasas : 0 })),
          totales: { casas: 'suma', porcentaje: totalCasas ? 1 : 0 },
        },
        {
          tipo: 'tabla', titulo: 'Progreso de territorios', hoja: 'Progreso', color: '#0891B2',
          columnas: [
            { titulo: 'Estado del territorio', clave: 'estado', colores: { 'Completado': '#059669', 'En progreso': '#D97706', 'Sin trabajar': '#64748B' } },
            { titulo: 'Territorios', clave: 'n', tipo: 'numero' },
            { titulo: 'Porcentaje', clave: 'p', tipo: 'porcentaje' },
          ],
          filas: ['completado', 'en_progreso', 'sin_trabajar'].map(e => ({ estado: PROGRESO[e].label, n: conteoTerritorios[e], p: conteoTerritorios[e] / totalT })),
        },
        resumenGrupos.length > 0 && {
          tipo: 'tabla', titulo: 'Avance por grupo de predicación', hoja: 'Grupos', color: '#D97706',
          columnas: [
            { titulo: 'Grupo', clave: 'grupo' },
            { titulo: 'Publicadores', clave: 'publicadores', tipo: 'numero' },
            { titulo: 'Territorio en progreso', clave: 'enProgreso' },
            { titulo: 'Avance', clave: 'avance', tipo: 'porcentaje' },
            { titulo: `Terminados ${anio}`, clave: 'terminados', tipo: 'numero' },
          ],
          filas: resumenGrupos.map(r => ({
            grupo: r.grupo.nombre,
            publicadores: r.publicadores,
            enProgreso: r.enProgreso.length ? r.enProgreso.map(x => x.numero || x.nombre).join(', ') : '',
            avance: r.enProgreso.length ? r.avance / 100 : null,
            terminados: r.terminadosAnio,
          })),
        },
        casosEsp.length > 0 && {
          tipo: 'tabla', titulo: 'Casos especiales', hoja: 'Casos especiales', color: '#DC2626',
          columnas: [
            { titulo: 'Dirección', clave: 'direccion' },
            { titulo: 'Territorio', clave: 'territorio_nombre' },
            { titulo: 'Tipo', clave: 'tipo_caso' },
            { titulo: 'Detalles', clave: 'detalles_caso', anchoPDF: 70 },
          ],
          filas: casosEsp,
        },
        // Datos de contacto: solo en el Excel (el reporte interactivo se comparte)
        {
          tipo: 'tabla', titulo: 'Detalle de casas', hoja: 'Casas', en: ['excel'],
          columnas: [
            { titulo: 'Dirección', clave: 'direccion' },
            { titulo: 'Territorio', clave: 'territorio_nombre' },
            { titulo: 'Estado', clave: 'estado', colores: colorEstado },
            { titulo: 'Contacto', clave: 'nombre_contacto' },
            { titulo: 'Teléfono', clave: 'telefono' },
            { titulo: 'Caso especial', clave: 'tiene_caso_especial', tipo: 'siNo' },
            { titulo: 'Tipo de caso', clave: 'tipo_caso' },
            { titulo: 'Detalles', clave: 'detalles_caso' },
            { titulo: 'Notas', clave: 'notas', ancho: 40 },
            { titulo: 'Registrada', clave: 'created_at', tipo: 'fecha' },
            { titulo: 'Latitud', clave: 'latitud', tipo: 'decimal', ancho: 12 },
            { titulo: 'Longitud', clave: 'longitud', tipo: 'decimal', ancho: 12 },
          ],
          filas: casasFiltradas,
        },
      ].filter(Boolean),
    };
  };

  const kpiCards = [
    {
      label: tx('Total Casas'),
      value: totalCasas,
      sub: tx('{n} territorios activos', { n: territorios.length }),
      icon: <Home size={22} style={{ color: '#2563EB' }} />,
      gradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      glowClass: 'stat-card-slate',
      accent: '#2563EB',
    },
    {
      label: tx('Atendidos'),
      value: atendidos,
      sub: tx('{n}% de cobertura', { n: porcAtendidos }),
      icon: <CheckCircle size={22} style={{ color: '#059669' }} />,
      gradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
      glowClass: 'stat-card-green',
      accent: '#059669',
    },
    {
      label: tx('Sin Contacto'),
      value: noAtendidos,
      sub: tx('No atendieron la visita'),
      icon: <XCircle size={22} style={{ color: '#DC2626' }} />,
      gradient: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      glowClass: 'stat-card-red',
      accent: '#DC2626',
    },
    {
      label: tx('Casos Especiales'),
      value: especiales,
      sub: tx('Atención diferenciada'),
      icon: <AlertTriangle size={22} style={{ color: '#D97706' }} />,
      gradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
      glowClass: 'stat-card-amber',
      accent: '#D97706',
    },
  ];


  // Va después de TODOS los hooks (un return antes cambia el número de hooks y truena React)
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-80 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-7 sm:mb-9 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">{tx('Estadísticas')}</h1>
          <p className="text-sm mt-0.5 text-secondary">{tx('Cobertura y actividad territorial en tiempo real')}</p>
        </div>
        <BotonesExportar armar={armarReporte} clase="btn btn-secondary text-sm" />
      </div>

      {/* Filtros de período */}
      <div className="card mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { id: 'hoy',       label: 'Hoy' },
            { id: 'semana',    label: 'Esta semana' },
            { id: 'mes',       label: 'Este mes' },
            { id: 'trimestre', label: 'Últimos 3 meses' },
            { id: 'todo',      label: 'Todo' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => handlePeriodo(p.id)}
              style={{
                background: periodoActivo === p.id ? '#2563EB' : 'transparent',
                color: periodoActivo === p.id ? '#fff' : 'var(--text-secondary)',
                border: `1.5px solid ${periodoActivo === p.id ? '#2563EB' : '#E2E8F0'}`,
                borderRadius: '9999px',
                padding: '5px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tx(p.label)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-secondary">{tx('Desde')}</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => {
                setFechaDesde(e.target.value);
                setPeriodoActivo('');
              }}
              style={{
                border: '1.5px solid var(--border-color)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                background: 'var(--bg-card)',
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-secondary">{tx('Hasta')}</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => {
                setFechaHasta(e.target.value);
                setPeriodoActivo('');
              }}
              style={{
                border: '1.5px solid var(--border-color)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                background: 'var(--bg-card)',
              }}
            />
          </div>
        </div>
        <p className="text-xs mt-3 text-muted">
          {periodoActivo === 'todo' && !fechaDesde && !fechaHasta
            ? 'Mostrando todos los datos'
            : `Mostrando datos del: ${fechaDesde
                ? new Date(fechaDesde + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'} al ${fechaHasta
                ? new Date(fechaHasta + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}`}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className={`kpi-card rounded-2xl p-4 sm:p-5 cursor-default transition-all duration-250 hover:-translate-y-1 ${k.glowClass}`}
            style={{
              '--accent': k.accent,
              background: k.gradient,
              border: `1px solid ${k.accent}30`,
              borderTop: `3px solid ${k.accent}`,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${k.accent}20` }}
              >
                {k.icon}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{tx(k.label)}</p>
              <p className="num-display text-3xl sm:text-4xl font-black leading-none my-1.5 tabular-nums text-primary">{k.value}</p>
              <p className="text-xs font-semibold" style={{ color: k.accent }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Coverage Hero */}
      {totalCasas > 0 && (
        <div className="card mb-5 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-2 text-secondary">{tx('Cobertura Global')}</p>
              <div className="flex items-end gap-2">
                <p className="num-display text-6xl font-black tabular-nums leading-none" style={{ color: '#059669' }}>{porcAtendidos}</p>
                <span className="text-2xl font-bold mb-1" style={{ color: '#059669' }}>%</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#10B981' }} />
                <span className="text-secondary"><strong style={{ color: '#059669' }}>{atendidos}</strong> {tx('atendidos')}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                <span className="text-secondary"><strong style={{ color: '#DC2626' }}>{noAtendidos}</strong> {tx('sin contacto')}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                <span className="text-secondary"><strong style={{ color: '#D97706' }}>{pendientes}</strong> {tx('pendientes')}</span>
              </span>
            </div>
          </div>
          {/* Segmented bar */}
          <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(0,0,0,0.08)' }}>
            {atendidos > 0 && (
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(atendidos / totalCasas) * 100}%`, background: 'linear-gradient(90deg, #059669, #10B981)' }}
              />
            )}
            {noAtendidos > 0 && (
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(noAtendidos / totalCasas) * 100}%`, background: 'linear-gradient(90deg, #DC2626, #EF4444)', marginLeft: '2px' }}
              />
            )}
            {pendientes > 0 && (
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(pendientes / totalCasas) * 100}%`, background: 'linear-gradient(90deg, #D97706, #F59E0B)', marginLeft: '2px' }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs mt-2 text-secondary">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#3B82F6' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Distribución por Estado')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalCasas > 0
              ? <Doughnut ref={chartDonutRef} data={donutData} options={donutOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin datos registrados')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#10B981' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Actividad por Territorio')}</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {terrData.length > 0
              ? <Bar ref={chartBarRef} data={barData} options={barOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('Sin territorios registrados')}</p>}
          </div>
        </div>
      </div>

      {/* Gráfico de Casos Especiales */}
      <div className="grid grid-cols-1 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#7C3AED' }} />
            <h3 className="text-sm font-bold text-primary">{tx('Casos Especiales por Territorio')}</h3>
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED' }}>
              {especiales} total
            </span>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {especiales > 0
              ? <Bar ref={chartEspRef} data={especialesData} options={especialesOptions} />
              : <p className="text-center pt-24 text-sm text-secondary">{tx('No hay casos especiales registrados')}</p>}
          </div>
        </div>
      </div>

      {/* Progreso por grupo de predicación */}
      <GruposDashboardCard
        disponible={gruposDisponibles}
        resumen={resumenGrupos}
        conteo={conteoTerritorios}
        miembros={miembros}
      />

      {/* Actividad Reciente */}
      <div
        className="card mb-5"
        style={{ borderLeft: '3px solid var(--primary-color, #2563EB)' }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#2563EB' }} />
          <h3 className="text-sm font-bold text-primary">{tx('Actividad Reciente')}</h3>
          {actividadReciente.length > 0 && (
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
              {actividadReciente.length} registros
            </span>
          )}
        </div>
        {actividadReciente.length === 0 ? (
          <p className="text-sm text-muted">{tx('Sin actividad reciente')}</p>
        ) : (
          <ul className="space-y-3">
            {actividadReciente.map((item) => {
              const casa = casas.find(c => String(c.id) === String(item.casa_id));
              const direccion = casa?.direccion || `Casa #${item.casa_id}`;
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 pb-3"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <p className="text-sm leading-snug text-primary">
                    <strong style={{ color: '#2563EB' }}>{item.usuario_nombre || 'Usuario'}</strong>
                    {' visitó '}
                    <span className="text-secondary">{direccion}</span>
                    {' — '}
                    <span className="text-secondary">{tx(item.estado_anterior)}</span>
                    {' → '}
                    <strong className="text-primary">{tx(item.estado_nuevo)}</strong>
                  </p>
                  <span className="text-xs shrink-0 tabular-nums text-muted">
                    {formatRelative(item.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Territory Detail Cards */}
      <div className="card">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
          <h3 className="text-sm font-bold text-primary">{tx('Detalle por Territorio')}</h3>
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
            {terrData.length} zonas
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {terrData.map((t, i) => {
            const pct = t.total > 0 ? Math.round((t.atendidos / t.total) * 100) : 0;
            const pctColor = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
            const barBg = pct >= 70
              ? 'linear-gradient(90deg, #059669, #10B981)'
              : pct >= 40
                ? 'linear-gradient(90deg, #D97706, #F59E0B)'
                : 'linear-gradient(90deg, #DC2626, #EF4444)';
            return (
              <div
                key={i}
                className="p-4 sm:p-5 rounded-2xl transition-all duration-200 cursor-default hover:-translate-y-0.5"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  borderLeft: `3px solid ${pctColor}80`,
                }}
              >
                {/* Header: nombre + badge total */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <strong className="text-sm font-bold leading-snug text-primary">{t.nombre}</strong>
                  <span className="text-xs tabular-nums font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
                    {t.total} casas
                  </span>
                </div>

                {/* Porcentaje centrado */}
                <div className="flex items-center justify-center gap-1 mb-3">
                  <p className="num-display text-3xl sm:text-4xl font-black tabular-nums leading-none" style={{ color: pctColor }}>
                    {pct}
                  </p>
                  <span className="text-lg font-bold mt-1" style={{ color: pctColor }}>%</span>
                  <span className="text-xs ml-2 mt-1 text-secondary">{tx('cobertura')}</span>
                </div>

                {/* Barra de progreso */}
                <div className="h-2 rounded-full mb-4 overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barBg }} />
                </div>

                {/* Stats en 2x2 grid con más espacio */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#10B981' }} />
                    <span className="text-xs text-secondary">
                      <strong className="tabular-nums" style={{ color: '#059669' }}>{t.atendidos}</strong> {tx('atend.')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                    <span className="text-xs text-secondary">
                      <strong className="tabular-nums" style={{ color: '#DC2626' }}>{t.noAtendidos}</strong> {tx('s/cont.')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                    <span className="text-xs text-secondary">
                      <strong className="tabular-nums" style={{ color: '#D97706' }}>{t.pendientes}</strong> {tx('pend.')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#7C3AED' }} />
                    <span className="text-xs text-secondary">
                      <strong className="tabular-nums" style={{ color: '#7C3AED' }}>{t.especiales}</strong> {tx('esp.')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {terrData.length === 0 && (
            <p className="text-sm col-span-full text-secondary">{tx('No hay territorios registrados.')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
