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
import { FileText, Table } from 'lucide-react';

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
    return <div className="p-8 text-center">Cargando estadísticas...</div>;
  }

  const totalCasas = casas.length;
  const atendidos = casas.filter(c => c.estado === 'Atendido').length;
  const noAtendidos = casas.filter(c => c.estado === 'No atendió').length;
  const pendientes = casas.filter(c => c.estado === 'Pendiente').length;
  const especiales = casas.filter(c => c.tiene_caso_especial).length;
  const porcAtendidos = totalCasas > 0 ? ((atendidos / totalCasas) * 100).toFixed(1) : 0;

  // Status counts
  const statusCounts = casas.reduce((acc, c) => {
    acc[c.estado] = (acc[c.estado] || 0) + 1;
    return acc;
  }, {});

  const statusLabels = Object.keys(statusCounts);
  const statusValues = Object.values(statusCounts);

  // Per-territory data
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
        backgroundColor: '#1F2937', titleFont: { size: 14, family: 'Inter' }, bodyFont: { size: 13, family: 'Inter' }, padding: 12, cornerRadius: 8,
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
      tooltip: { backgroundColor: '#1F2937', titleFont: { size: 14, family: 'Inter' }, bodyFont: { size: 13, family: 'Inter' }, padding: 12, cornerRadius: 8 },
      title: { display: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12, family: 'Inter' } } },
      y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 12, family: 'Inter' }, stepSize: 1 } }
    }
  };

  // --- PDF Generation ---
  const generatePDF = () => {
    const doc = new jsPDF('p', 'mm', 'letter');
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
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

    // Section 1: Resumen Ejecutivo
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

    // KPI Table
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

    // Section 3: Desglose por Territorio
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

    // Section 4: Distribución por Estado
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

    // Section 5: Detalle de Casos Especiales
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

    // Footer on every page
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

    // Sheet 1: Resumen
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

    // Sheet 2: Detalle de Casas
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

    // Sheet 3: Por Territorio
    const terrHeaders = ['Territorio', 'Total', 'Atendidos', 'No Atendió', 'Pendientes', 'Especiales'];
    const terrRows = terrData.map(t => [t.nombre, t.total, t.atendidos, t.noAtendidos, t.pendientes, t.especiales]);
    const ws3 = XLSX.utils.aoa_to_sheet([terrHeaders, ...terrRows]);
    ws3['!cols'] = terrHeaders.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Territorio');

    XLSX.writeFile(wb, `Datos_Territorial_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold m-0">Estadísticas del Territorio</h1>
        <div className="flex gap-3 flex-wrap">
          <button onClick={generatePDF} className="btn btn-primary flex items-center gap-2 w-full sm:w-auto">
            <FileText size={16} /> Descargar PDF
          </button>
          <button onClick={generateExcel} className="btn btn-secondary flex items-center gap-2 w-full sm:w-auto">
            <Table size={16} /> Descargar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-8">
        <div className="card flex flex-col items-center justify-center hover:-translate-y-1 transition-transform duration-200 cursor-default">
          <h3 className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Total Casas</h3>
          <p className="text-2xl sm:text-4xl font-bold text-gray-900 m-0">{totalCasas}</p>
        </div>
        <div className="card flex flex-col items-center justify-center hover:-translate-y-1 transition-transform duration-200 cursor-default">
          <h3 className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Atendidos</h3>
          <p className="text-2xl sm:text-4xl font-bold text-emerald-500 m-0">{atendidos}</p>
          <span className="badge mt-2 bg-emerald-50 text-emerald-800">{porcAtendidos}%</span>
        </div>
        <div className="card flex flex-col items-center justify-center hover:-translate-y-1 transition-transform duration-200 cursor-default">
          <h3 className="text-gray-500 text-xs mb-2 uppercase tracking-wide">No Atendieron</h3>
          <p className="text-2xl sm:text-4xl font-bold text-red-500 m-0">{noAtendidos}</p>
        </div>
        <div className="card flex flex-col items-center justify-center hover:-translate-y-1 transition-transform duration-200 cursor-default">
          <h3 className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Casos Especiales</h3>
          <p className="text-2xl sm:text-4xl font-bold text-amber-500 m-0">{especiales}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h3 className="text-base font-medium mb-6">Distribución por Estado</h3>
          <div className="relative h-80">
            {totalCasas > 0 ? <Doughnut data={donutData} options={donutOptions} /> :
              <p className="text-center text-gray-500 pt-20">Sin datos</p>}
          </div>
        </div>

        <div className="card">
          <h3 className="text-base font-medium mb-6">Actividad por Territorio</h3>
          <div className="relative h-80">
            {terrData.length > 0 ? <Bar data={barData} options={barOptions} /> :
              <p className="text-center text-gray-500 pt-20">Sin territorios</p>}
          </div>
        </div>
      </div>

      {/* Territory Detail Cards */}
      <div className="card">
        <h3 className="text-base font-medium mb-6">Detalle por Territorio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {terrData.map((t, i) => (
            <div key={i} className="p-5 border border-gray-200 rounded-lg hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
              <div className="flex justify-between items-center mb-3">
                <strong>{t.nombre}</strong>
                <span className="badge bg-gray-100">{t.total} casas</span>
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>{t.atendidos}
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>{t.noAtendidos}
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>{t.pendientes}
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>⚠️ {t.especiales}
                </span>
              </div>
            </div>
          ))}
          {terrData.length === 0 && <p className="text-gray-500">No hay territorios registrados.</p>}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
