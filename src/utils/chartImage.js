import { Chart } from 'chart.js';

// Genera un PNG de alta resolución de una gráfica de Chart.js para los PDFs.
// No es una captura de lo que se ve en pantalla: vuelve a dibujar la gráfica en un canvas
// aparte, con fondo blanco, textos oscuros (se lee igual aunque la app esté en modo oscuro),
// tamaño fijo y sin animación.

const fondoBlanco = {
  id: 'pdfFondoBlanco',
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

const TEXTO = '#1F2937';
const FUENTE = { family: 'Helvetica, Arial, sans-serif' };

// Copia de los datos (Chart.js "observa" los arrays; no se comparten entre gráficas)
const copiarDatos = (data) => ({
  ...data,
  labels: [...(data.labels || [])],
  datasets: (data.datasets || []).map(d => ({ ...d, data: [...(d.data || [])] })),
});

const opcionesPDF = (options = {}, escala) => {
  const plugins = options.plugins || {};
  const scales = Object.fromEntries(Object.entries(options.scales || {}).map(([id, s]) => [id, {
    ...s,
    ticks: { ...(s.ticks || {}), color: TEXTO, font: { ...FUENTE, size: 13 * escala } },
    grid: { ...(s.grid || {}), color: 'rgba(0,0,0,0.08)' },
    title: s.title ? { ...s.title, color: TEXTO, font: { ...FUENTE, size: 14 * escala, weight: 'bold' } } : s.title,
  }]));
  return {
    ...options,
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
    devicePixelRatio: 1,
    layout: { padding: 16 * escala },
    plugins: {
      ...plugins,
      tooltip: { enabled: false },
      legend: plugins.legend === false ? false : {
        ...(plugins.legend || {}),
        labels: { ...(plugins.legend?.labels || {}), color: TEXTO, font: { ...FUENTE, size: 14 * escala }, padding: 12 * escala },
      },
      title: plugins.title?.display ? {
        ...plugins.title,
        color: TEXTO,
        font: { ...FUENTE, size: 18 * escala, weight: 'bold' },
      } : plugins.title,
    },
    scales,
  };
};

/**
 * @param chartRef  ref de react-chartjs-2 (o la instancia de Chart)
 * @param size      { width, height } en píxeles del PNG (por defecto 1600×900)
 * @returns data URL "image/png" o null si la gráfica no existe
 */
export const chartToPNG = (chartRef, { width = 1600, height = 900 } = {}) => {
  const fuente = chartRef?.current ?? chartRef;
  if (!fuente?.config) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // Textos proporcionales al tamaño (la UI está pensada para ~600 px de ancho)
  const escala = width / 600;

  const chart = new Chart(canvas, {
    type: fuente.config.type,
    data: copiarDatos(fuente.config.data),
    options: opcionesPDF(fuente.config.options, escala),
    plugins: [...(fuente.config.plugins || []), fondoBlanco],
  });
  const png = chart.toBase64Image('image/png', 1);
  chart.destroy();
  return png;
};
