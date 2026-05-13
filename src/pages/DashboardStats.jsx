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
  const donutOptions = {
    responsive: true, maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 12, font: { size: 13, family: 'Inter' } } },
      tooltip: {
        backgroundColor: '#1F2937', titleFont: { size: 14, family: 'Inter' }, bodyFont: { size: 13, family: 'Inter' }, padding: 12, cornerRadius: 10,
        callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw / totalCasas) * 100).toFixed(1)}%)` }
      }
    }
  };

  // --- Bar Chart ---
  const barData = {
    labels: terrData.map(t => t.nombre),
    datasets: [
      { label: 'Atendidos', data: terrData.map(t => t.atendidos), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6, borderSkipped: false },
      { label: 'No Atendió', data: terrData.map(t => t.noAtendidos), backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 6, borderSkipped: false },
      { label: 'Pendientes', data: terrData.map(t => t.pendientes), backgroundColor: 'rgba(245,158,11,0.75)', borderRadius: 6, borderSkipped: false }
    ]
  };
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 12, font: { size: 13, family: 'Inter' } } },
      tooltip: { backgroundColor: '#1F2937', titleFont: { size: 14, family: 'Inter' }, bodyFont: { size: 13, family: 'Inter' }, padding: 12, cornerRadius: 10 },
      title: { display: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12, family: 'Inter' } } },
      y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { font: { size: 12, family: 'Inter' }, stepSize: 1 } }
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
      icon: <Home size={22} className="text-white/70" />,
      gradient: 'linear-gradient(135deg, #334155 0%, #1E293B 100%)',
      shadow: '0 8px 24px rgba(30,41,59,0.4)',
    },
    {
      label: 'Atendidos',
      value: atendidos,
      sub: `${porcAtendidos}% del total`,
      icon: <CheckCircle size={22} className="text-white/70" />,
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      shadow: '0 8px 24px rgba(16,185,129,0.35)',
    },
    {
      label: 'No Atendieron',
      value: noAtendidos,
      sub: 'Sin contacto',
      icon: <XCircle size={22} className="text-white/70" />,
      gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      shadow: '0 8px 24px rgba(239,68,68,0.35)',
    },
    {
      label: 'Casos Especiales',
      value: especiales,
      sub: 'Atención diferenciada',
      icon: <AlertTriangle size={22} className="text-white/70" />,
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      shadow: '0 8px 24px rgba(245,158,11,0.35)',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-5 sm:mb-7 gap-4">
        <h1 className="text-xl sm:text-2xl font-bold m-0">Estadísticas del Territorio</h1>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button onClick={generatePDF} className="btn btn-primary flex items-center gap-2">
            <FileText size={15} /> Descargar PDF
          </button>
          <button onClick={generateExcel} className="btn btn-secondary flex items-center gap-2">
            <Table size={15} /> Descargar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {kpiCards.map((k, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 sm:p-5 text-white cursor-default transition-transform duration-200 hover:-translate-y-0.5"
            style={{ background: k.gradient, boxShadow: k.shadow }}
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {k.label}
              </p>
              {k.icon}
            </div>
            <p className="text-3xl sm:text-4xl font-bold leading-none mb-1">{k.value}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="card">
          <h3 className="text-base font-bold mb-5">Distribución por Estado</h3>
          <div className="relative h-72">
            {totalCasas > 0
              ? <Doughnut data={donutData} options={donutOptions} />
              : <p className="text-center text-gray-400 pt-20 text-sm">Sin datos registrados</p>}
          </div>
        </div>
        <div className="card">
          <h3 className="text-base font-bold mb-5">Actividad por Territorio</h3>
          <div className="relative h-72">
            {terrData.length > 0
              ? <Bar data={barData} options={barOptions} />
              : <p className="text-center text-gray-400 pt-20 text-sm">Sin territorios registrados</p>}
          </div>
        </div>
      </div>

      {/* Territory Detail Cards */}
      <div className="card">
        <h3 className="text-base font-bold mb-5">Detalle por Territorio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {terrData.map((t, i) => (
            <div
              key={i}
              className="p-4 border border-gray-100 rounded-xl bg-gray-50/60 hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default"
            >
              <div className="flex justify-between items-center mb-3">
                <strong className="text-sm font-bold text-gray-800 truncate mr-2">{t.nombre}</strong>
                <span className="badge bg-slate-100 text-slate-700 shrink-0">{t.total}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Atendidos: <strong className="text-gray-700">{t.atendidos}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  Sin contacto: <strong className="text-gray-700">{t.noAtendidos}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  Pendientes: <strong className="text-gray-700">{t.pendientes}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  Especiales: <strong className="text-gray-700">{t.especiales}</strong>
                </span>
              </div>
            </div>
          ))}
          {terrData.length === 0 && (
            <p className="text-gray-400 text-sm col-span-3">No hay territorios registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
