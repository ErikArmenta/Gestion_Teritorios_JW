import React from 'react';
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
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    titleFont: { size: 13, family: 'Inter', weight: '600' },
    bodyFont: { size: 12, family: 'Inter' },
    padding: 12,
    cornerRadius: 10,
    titleColor: '#E2E8F0',
    bodyColor: '#94A3B8',
  };

  const donutOptions = {
    responsive: true, maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: '#94A3B8' }
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
        labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, family: 'Inter' }, color: '#94A3B8' }
      },
      tooltip: { ...CHART_TOOLTIP },
      title: { display: false }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: '#64748B' },
        border: { color: 'rgba(255,255,255,0.06)' },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
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
      sub: `${territorios.length} territorios`,
      icon: <Home size={20} className="text-white/80" />,
      gradient: 'linear-gradient(135deg, #1E3A5F 0%, #0F2040 100%)',
      glowClass: 'stat-card-slate',
      accent: '#3B82F6',
    },
    {
      label: 'Atendidos',
      value: atendidos,
      sub: `${porcAtendidos}% del total`,
      icon: <CheckCircle size={20} className="text-white/80" />,
      gradient: 'linear-gradient(135deg, #064E3B 0%, #022c22 100%)',
      glowClass: 'stat-card-green',
      accent: '#10B981',
    },
    {
      label: 'Sin Contacto',
      value: noAtendidos,
      sub: 'No atendieron',
      icon: <XCircle size={20} className="text-white/80" />,
      gradient: 'linear-gradient(135deg, #7F1D1D 0%, #450a0a 100%)',
      glowClass: 'stat-card-red',
      accent: '#EF4444',
    },
    {
      label: 'Casos Especiales',
      value: especiales,
      sub: 'Atención diferenciada',
      icon: <AlertTriangle size={20} className="text-white/80" />,
      gradient: 'linear-gradient(135deg, #78350F 0%, #3d1a05 100%)',
      glowClass: 'stat-card-amber',
      accent: '#F59E0B',
    },
  ];

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 sm:mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Estadísticas</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Cobertura y actividad territorial</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button onClick={generatePDF} className="btn btn-primary flex items-center gap-2">
            <FileText size={15} /> PDF
          </button>
          <button onClick={generateExcel} className="btn btn-secondary flex items-center gap-2">
            <Table size={15} /> Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className={`rounded-2xl p-4 sm:p-5 text-white cursor-default transition-all duration-250 hover:-translate-y-1 ${k.glowClass}`}
            style={{ background: k.gradient, border: `1px solid ${k.accent}30` }}
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {k.label}
              </p>
              <div className="p-1.5 rounded-lg" style={{ background: `${k.accent}25` }}>
                {k.icon}
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold leading-none mb-1 tabular-nums">{k.value}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Coverage progress bar */}
      {totalCasas > 0 && (
        <div className="card mb-5 p-4 sm:p-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Cobertura global</span>
            <span className="text-sm font-bold" style={{ color: '#10B981' }}>{porcAtendidos}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${porcAtendidos}%`, background: 'linear-gradient(90deg, #059669 0%, #10B981 100%)' }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1.5" style={{ color: '#475569' }}>
            <span>{atendidos} atendidos</span>
            <span>{totalCasas - atendidos} restantes</span>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="card">
          <h3 className="text-sm font-bold mb-4 uppercase tracking-wider" style={{ color: '#64748B' }}>Distribución por Estado</h3>
          <div className="relative h-72">
            {totalCasas > 0
              ? <Doughnut data={donutData} options={donutOptions} />
              : <p className="text-center pt-20 text-sm" style={{ color: '#475569' }}>Sin datos registrados</p>}
          </div>
        </div>
        <div className="card">
          <h3 className="text-sm font-bold mb-4 uppercase tracking-wider" style={{ color: '#64748B' }}>Actividad por Territorio</h3>
          <div className="relative h-72">
            {terrData.length > 0
              ? <Bar data={barData} options={barOptions} />
              : <p className="text-center pt-20 text-sm" style={{ color: '#475569' }}>Sin territorios registrados</p>}
          </div>
        </div>
      </div>

      {/* Territory Detail Cards */}
      <div className="card">
        <h3 className="text-sm font-bold mb-5 uppercase tracking-wider" style={{ color: '#64748B' }}>Detalle por Territorio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {terrData.map((t, i) => {
            const pct = t.total > 0 ? Math.round((t.atendidos / t.total) * 100) : 0;
            return (
              <div
                key={i}
                className="p-4 rounded-xl transition-all duration-200 cursor-default hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                <div className="flex justify-between items-center mb-3">
                  <strong className="text-sm font-bold truncate mr-2" style={{ color: '#E2E8F0' }}>{t.nombre}</strong>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>{t.total}</span>
                </div>
                {/* Mini progress */}
                <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #059669, #10B981)' }} />
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-xs" style={{ color: '#64748B' }}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span style={{ color: '#10B981' }}>{t.atendidos}</span> atend.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span style={{ color: '#EF4444' }}>{t.noAtendidos}</span> s/cont.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span style={{ color: '#F59E0B' }}>{t.pendientes}</span> pend.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                    <span style={{ color: '#A78BFA' }}>{t.especiales}</span> esp.
                  </span>
                </div>
              </div>
            );
          })}
          {terrData.length === 0 && (
            <p className="text-sm col-span-3" style={{ color: '#475569' }}>No hay territorios registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
