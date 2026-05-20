import React, { useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend, Title
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FileText, Table, Home, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

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

  const chartDonutRef = useRef(null);
  const chartBarRef = useRef(null);
  const chartEspRef = useRef(null);

  const totalCasas = casas.length;
  const atendidos = casas.filter(c => c.estado === 'Atendido').length;
  const noAtendidos = casas.filter(c => c.estado === 'No atendió').length;
  const pendientes = casas.filter(c => c.estado === 'Pendiente').length;
  const especiales = casas.filter(c => c.tiene_caso_especial).length;
  const porcAtendidos = totalCasas > 0 ? ((atendidos / totalCasas) * 100).toFixed(1) : 0;

  const statusCounts = casas.reduce((acc, c) => {
    acc[c.estado] = (acc[c.estado] || 0) + 1;
    return acc;
  }, {});

  const statusLabels = Object.keys(statusCounts);
  const statusValues = Object.values(statusCounts);

  const terrData = territorios.map(t => {
    const c = casas.filter(h => String(h.territorio_id) === String(t.id));
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
      label: 'Casos Especiales',
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
      x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#64748B' } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#64748B', stepSize: 1 } },
    },
  };

  // --- Donut Chart ---
  const donutData = {
    labels: statusLabels,
    datasets: [{
      data: statusValues,
      backgroundColor: statusLabels.map(s => STATUS_COLORS[s]?.bg || 'rgba(156,163,175,0.7)'),
      borderColor: statusLabels.map(s => STATUS_COLORS[s]?.hex || '#9CA3AF'),
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
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: '#475569' }
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
      { label: 'Atendidos',  data: terrData.map(t => t.atendidos),   backgroundColor: 'rgba(16,185,129,0.8)',  borderRadius: 7, borderSkipped: false },
      { label: 'No Atendió', data: terrData.map(t => t.noAtendidos), backgroundColor: 'rgba(239,68,68,0.8)',   borderRadius: 7, borderSkipped: false },
      { label: 'Pendientes', data: terrData.map(t => t.pendientes),  backgroundColor: 'rgba(245,158,11,0.8)',  borderRadius: 7, borderSkipped: false }
    ]
  };
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: '#475569' }
      },
      tooltip: { ...CHART_TOOLTIP },
      title: { display: false }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: '#64748B' },
        border: { color: 'rgba(0,0,0,0.06)' },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: '#64748B', stepSize: 1 },
        border: { color: 'transparent' },
      }
    }
  };

  // --- PDF Generation ---
  const generatePDF = () => {
    const doc = new jsPDF('p', 'mm', 'letter');
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFillColor(31, 41, 55);
    doc.rect(0, 0, pageW, 42, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Gestión Territorial JW', pageW / 2, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte Ejecutivo de Cobertura y Actividad', pageW / 2, 27, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}  |  Usuario: ${user?.nombre || 'N/A'}`, pageW / 2, 36, { align: 'center' });
    y = 52;

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Resumen Ejecutivo', 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const resumen = [
      `Este documento presenta un análisis integral del progreso de cobertura territorial. Al momento de la generación de este reporte, se han registrado un total de ${totalCasas} viviendas distribuidas en ${territorios.length} territorio(s) activo(s).`,
      ``,
      `El índice de atención global es del ${porcAtendidos}%, con ${atendidos} hogares atendidos, ${noAtendidos} hogares donde no se logró contacto, y ${pendientes} registros en estado pendiente. Se identificaron ${especiales} caso(s) con marcación especial que requieren atención diferenciada.`
    ];
    resumen.forEach(line => {
      const split = doc.splitTextToSize(line, pageW - 28);
      doc.text(split, 14, y);
      y += split.length * 5 + 2;
    });
    y += 4;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Indicadores Clave de Desempeño (KPIs)', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor', 'Detalle']],
      body: [
        ['Total de Viviendas', String(totalCasas), 'Registros activos en la plataforma'],
        ['Viviendas Atendidas', String(atendidos), `${porcAtendidos}% del total`],
        ['Sin Contacto', String(noAtendidos), 'Hogares donde no se logró atención'],
        ['Pendientes', String(pendientes), 'Hogares por visitar'],
        ['Casos Especiales', String(especiales), 'Marcados con atención diferenciada'],
        ['Territorios Activos', String(territorios.length), 'Zonas geográficas definidas']
      ],
      headStyles: { fillColor: [31, 41, 55], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { font: 'helvetica', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 4 }
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Desglose por Territorio', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Territorio', 'Total', 'Atendidos', 'No Atendió', 'Pendientes', 'Especiales']],
      body: terrData.map(t => [t.nombre, t.total, t.atendidos, t.noAtendidos, t.pendientes, t.especiales]),
      headStyles: { fillColor: [59, 130, 246], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { font: 'helvetica', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 4 }
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Distribución por Estado de Visita', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Estado', 'Cantidad', 'Porcentaje']],
      body: statusLabels.map((label, i) => [label, statusValues[i], `${((statusValues[i] / totalCasas) * 100).toFixed(1)}%`]),
      headStyles: { fillColor: [16, 185, 129], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { font: 'helvetica', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 4 }
    });
    y = doc.lastAutoTable.finalY + 10;

    const casosEsp = casas.filter(c => c.tiene_caso_especial);
    if (casosEsp.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('5. Detalle de Casos Especiales', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Dirección', 'Territorio', 'Tipo', 'Detalles']],
        body: casosEsp.map(c => [c.direccion, c.territorio_nombre, c.tipo_caso || 'N/A', c.detalles_caso || 'N/A']),
        headStyles: { fillColor: [239, 68, 68], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { font: 'helvetica', fontSize: 9 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: 14, right: 14 },
        styles: { cellPadding: 4 },
        columnStyles: { 3: { cellWidth: 60 } }
      });
    }

    // ── GRÁFICOS EN PDF ──
    // Cada gráfico en su propia página

    // Gráfico 1: Donut — Distribución por Estado
    if (chartDonutRef.current) {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('5. Distribución por Estado', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const estadoLabels = Object.entries(statusCounts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v} (${((v / totalCasas) * 100).toFixed(1)}%)`)
        .join('   |   ');
      doc.text(estadoLabels, 14, y, { maxWidth: pageW - 28 });
      y += 10;
      const donutImg = chartDonutRef.current.toBase64Image();
      const donutW = Math.min(pageW - 60, 120);
      const donutX = (pageW - donutW) / 2;
      doc.addImage(donutImg, 'PNG', donutX, y, donutW, donutW * 0.75);
    }

    // Gráfico 2: Bar — Actividad por Territorio
    if (chartBarRef.current) {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('6. Actividad por Territorio', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const terrResumen = terrData.slice(0, 5).map(t => `${t.nombre}: ${t.total}`).join('   |   ');
      doc.text(terrResumen, 14, y, { maxWidth: pageW - 28 });
      y += 10;
      const barImg = chartBarRef.current.toBase64Image();
      const barW = pageW - 30;
      doc.addImage(barImg, 'PNG', 15, y, barW, barW * 0.45);
    }

    // Gráfico 3: Casos Especiales
    if (chartEspRef.current && especiales > 0) {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('7. Casos Especiales por Territorio', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const espResumen = terrData.filter(t => t.especiales > 0)
        .map(t => `${t.nombre}: ${t.especiales}`)
        .join('   |   ');
      doc.text(`Total: ${especiales} casos  |  ${espResumen}`, 14, y, { maxWidth: pageW - 28 });
      y += 10;
      const espImg = chartEspRef.current.toBase64Image();
      const espW = pageW - 30;
      doc.addImage(espImg, 'PNG', 15, y, espW, espW * 0.45);
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text('Gestión Territorial JW  |  Desarrollado por Master Engenering EA', pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }
    doc.save(`Reporte_Territorial_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // --- Excel Generation ---
  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    const resumenData = [
      ['Indicador', 'Valor'],
      ['Total de Viviendas', totalCasas],
      ['Atendidos', atendidos],
      ['No Atendió', noAtendidos],
      ['Pendientes', pendientes],
      ['Casos Especiales', especiales],
      ['% Cobertura', `${porcAtendidos}%`],
      ['Territorios Activos', territorios.length]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumenData);
    ws1['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    const headers = ['Dirección', 'Territorio', 'Estado', 'Contacto', 'Teléfono', 'Caso Especial', 'Tipo Caso', 'Detalles', 'Notas', 'Latitud', 'Longitud'];
    const rows = casas.map(c => [
      c.direccion, c.territorio_nombre, c.estado, c.nombre_contacto || '',
      c.telefono || '', c.tiene_caso_especial ? 'Sí' : 'No',
      c.tipo_caso || '', c.detalles_caso || '', c.notas || '',
      c.latitud, c.longitud
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws2['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Casas');

    const terrHeaders = ['Territorio', 'Total', 'Atendidos', 'No Atendió', 'Pendientes', 'Especiales'];
    const terrRows = terrData.map(t => [t.nombre, t.total, t.atendidos, t.noAtendidos, t.pendientes, t.especiales]);
    const ws3 = XLSX.utils.aoa_to_sheet([terrHeaders, ...terrRows]);
    ws3['!cols'] = terrHeaders.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Territorio');

    XLSX.writeFile(wb, `Datos_Territorial_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const kpiCards = [
    {
      label: 'Total Casas',
      value: totalCasas,
      sub: `${territorios.length} territorios activos`,
      icon: <Home size={22} style={{ color: '#2563EB' }} />,
      gradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      glowClass: 'stat-card-slate',
      accent: '#2563EB',
    },
    {
      label: 'Atendidos',
      value: atendidos,
      sub: `${porcAtendidos}% de cobertura`,
      icon: <CheckCircle size={22} style={{ color: '#059669' }} />,
      gradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
      glowClass: 'stat-card-green',
      accent: '#059669',
    },
    {
      label: 'Sin Contacto',
      value: noAtendidos,
      sub: 'No atendieron la visita',
      icon: <XCircle size={22} style={{ color: '#DC2626' }} />,
      gradient: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      glowClass: 'stat-card-red',
      accent: '#DC2626',
    },
    {
      label: 'Casos Especiales',
      value: especiales,
      sub: 'Atención diferenciada',
      icon: <AlertTriangle size={22} style={{ color: '#D97706' }} />,
      gradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
      glowClass: 'stat-card-amber',
      accent: '#D97706',
    },
  ];

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-7 sm:mb-9 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Estadísticas</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Cobertura y actividad territorial en tiempo real</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={generatePDF} className="btn btn-primary flex items-center gap-2">
            <FileText size={15} /> Exportar PDF
          </button>
          <button onClick={generateExcel} className="btn btn-secondary flex items-center gap-2">
            <Table size={15} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className={`rounded-2xl p-4 sm:p-5 cursor-default transition-all duration-250 hover:-translate-y-1 ${k.glowClass}`}
            style={{
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
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{k.label}</p>
              <p className="num-display text-3xl sm:text-4xl font-black leading-none my-1.5 tabular-nums" style={{ color: '#0F172A' }}>{k.value}</p>
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
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#475569' }}>Cobertura Global</p>
              <div className="flex items-end gap-2">
                <p className="num-display text-6xl font-black tabular-nums leading-none" style={{ color: '#059669' }}>{porcAtendidos}</p>
                <span className="text-2xl font-bold mb-1" style={{ color: '#059669' }}>%</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#10B981' }} />
                <span style={{ color: '#64748B' }}><strong style={{ color: '#059669' }}>{atendidos}</strong> atendidos</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                <span style={{ color: '#64748B' }}><strong style={{ color: '#DC2626' }}>{noAtendidos}</strong> sin contacto</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                <span style={{ color: '#64748B' }}><strong style={{ color: '#D97706' }}>{pendientes}</strong> pendientes</span>
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
          <div className="flex justify-between text-xs mt-2" style={{ color: '#334155' }}>
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
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Distribución por Estado</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {totalCasas > 0
              ? <Doughnut ref={chartDonutRef} data={donutData} options={donutOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin datos registrados</p>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#10B981' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Actividad por Territorio</h3>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {terrData.length > 0
              ? <Bar ref={chartBarRef} data={barData} options={barOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>Sin territorios registrados</p>}
          </div>
        </div>
      </div>

      {/* Gráfico de Casos Especiales */}
      <div className="grid grid-cols-1 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#7C3AED' }} />
            <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Casos Especiales por Territorio</h3>
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED' }}>
              {especiales} total
            </span>
          </div>
          <div className="relative h-64 sm:h-72 md:h-80">
            {especiales > 0
              ? <Bar ref={chartEspRef} data={especialesData} options={especialesOptions} />
              : <p className="text-center pt-24 text-sm" style={{ color: '#475569' }}>No hay casos especiales registrados</p>}
          </div>
        </div>
      </div>

      {/* Territory Detail Cards */}
      <div className="card">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
          <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Detalle por Territorio</h3>
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
                  background: 'rgba(0,0,0,0.02)',
                  border: '1px solid rgba(0,0,0,0.07)',
                  borderLeft: `3px solid ${pctColor}80`,
                }}
              >
                {/* Header: nombre + badge total */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <strong className="text-sm font-bold leading-snug" style={{ color: '#0F172A' }}>{t.nombre}</strong>
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
                  <span className="text-xs ml-2 mt-1" style={{ color: '#475569' }}>cobertura</span>
                </div>

                {/* Barra de progreso */}
                <div className="h-2 rounded-full mb-4 overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barBg }} />
                </div>

                {/* Stats en 2x2 grid con más espacio */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#10B981' }} />
                    <span className="text-xs" style={{ color: '#64748B' }}>
                      <strong className="tabular-nums" style={{ color: '#059669' }}>{t.atendidos}</strong> atend.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                    <span className="text-xs" style={{ color: '#64748B' }}>
                      <strong className="tabular-nums" style={{ color: '#DC2626' }}>{t.noAtendidos}</strong> s/cont.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                    <span className="text-xs" style={{ color: '#64748B' }}>
                      <strong className="tabular-nums" style={{ color: '#D97706' }}>{t.pendientes}</strong> pend.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#7C3AED' }} />
                    <span className="text-xs" style={{ color: '#64748B' }}>
                      <strong className="tabular-nums" style={{ color: '#7C3AED' }}>{t.especiales}</strong> esp.
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {terrData.length === 0 && (
            <p className="text-sm col-span-full" style={{ color: '#475569' }}>No hay territorios registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
