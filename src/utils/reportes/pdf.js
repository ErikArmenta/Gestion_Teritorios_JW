// PDF con la marca de la app (jsPDF + autotable, se cargan solo al exportar).
// Portada con logo, tarjetas de indicadores, gráficas (SVG → PNG) y tablas con el mismo estilo.
import { MARCA, aclarar, calcularTotales, descargar, enDestino, esNumerica, hexARgb, logoPNG, metaCompleta, nombreSeguro, textoCelda } from './comun';
import { graficaPNG } from './graficas';

const M = 14; // margen
const ARRIBA = 24; // dónde empieza el contenido en las páginas 2+

export async function exportarPDF(reporte) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: reporte.horizontal ? 'l' : 'p', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const color = reporte.color || MARCA.azul;
  const rgb = hexARgb(color);
  const logo = await logoPNG();
  let y;

  const tinta = () => doc.setTextColor(...hexARgb(MARCA.tinta));
  const nuevaPagina = () => { doc.addPage(); y = ARRIBA; };
  const espacio = (mm) => { if (y + mm > H - 18) nuevaPagina(); };

  // ── Portada (banda superior) ──
  doc.setFillColor(...hexARgb(MARCA.tinta));
  doc.rect(0, 0, W, 46, 'F');
  doc.setFillColor(...rgb);
  doc.rect(0, 46, W, 2.2, 'F');
  let xt = M;
  if (logo) {
    doc.addImage(logo, 'PNG', M, 9.5, 27, 27);
    xt = M + 33;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(reporte.titulo, W - xt - M)[0], xt, 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...hexARgb(aclarar(color, 0.55)));
  doc.text([reporte.subtitulo, MARCA.app].filter(Boolean).join('  ·  '), xt, 26.5);
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(doc.splitTextToSize(metaCompleta(reporte).map((x) => `${x.etiqueta}: ${x.valor}`).join('   ·   '), W - xt - M).slice(0, 2), xt, 33.5);
  y = 58;

  // ── Indicadores ──
  const kpis = reporte.kpis || [];
  if (kpis.length) {
    const cols = Math.min(4, kpis.length);
    const gap = 4;
    const ancho = (W - 2 * M - gap * (cols - 1)) / cols;
    const alto = 25;
    kpis.forEach((k, i) => {
      const c = i % cols;
      if (i && c === 0) y += alto + gap;
      const x = M + c * (ancho + gap);
      const kc = hexARgb(k.color || color);
      doc.setFillColor(...hexARgb(MARCA.fondo));
      doc.setDrawColor(...hexARgb(MARCA.borde));
      doc.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
      doc.setFillColor(...kc);
      doc.rect(x + 3, y, ancho - 6, 1.3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...hexARgb(MARCA.gris));
      doc.text(String(k.etiqueta).toUpperCase(), x + 4, y + 7, { maxWidth: ancho - 8 });
      doc.setFontSize(17);
      doc.setTextColor(...kc);
      doc.text(String(k.valor), x + 4, y + 16);
      if (k.detalle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...hexARgb(MARCA.gris));
        doc.text(doc.splitTextToSize(String(k.detalle), ancho - 8)[0], x + 4, y + 21.5);
      }
    });
    y += alto + 10;
  }

  // ── Secciones ──
  const titulo = (s, minimo = 30) => {
    espacio(minimo);
    doc.setFillColor(...hexARgb(s.color || color));
    doc.roundedRect(M, y - 4.2, 1.6, 5.6, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    tinta();
    doc.text(s.titulo, M + 4, y);
    y += 3;
    if (s.descripcion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...hexARgb(MARCA.gris));
      const lineas = doc.splitTextToSize(s.descripcion, W - 2 * M);
      doc.text(lineas, M, y + 3.5);
      y += lineas.length * 3.8 + 1;
    }
    y += 3;
  };

  for (let s of reporte.secciones || []) {
    if (!enDestino(s, 'pdf')) continue;
    if (s.tipo === 'texto') {
      titulo(s, 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...hexARgb(MARCA.pizarra));
      for (const p of s.parrafos) {
        const lineas = doc.splitTextToSize(p, W - 2 * M);
        espacio(lineas.length * 4.6);
        doc.text(lineas, M, y + 2);
        y += lineas.length * 4.6 + 2.5;
      }
      y += 5;
    } else if (s.tipo === 'grafica') {
      const png = await graficaPNG(s.grafica);
      if (!png) continue;
      // Ancho completo; si queda más alta que una página, se reduce (gráficas horizontales con muchas filas)
      const maxAlto = H - ARRIBA - 18 - 14;
      let ancho = W - 2 * M;
      let alto = (ancho * png.alto) / png.ancho;
      if (alto > maxAlto) { ancho = (ancho * maxAlto) / alto; alto = maxAlto; }
      titulo(s, alto + 14);
      espacio(alto + 4);
      const x = (W - ancho) / 2;
      doc.setDrawColor(...hexARgb(MARCA.borde));
      doc.roundedRect(x, y - 1, ancho, alto + 2, 3, 3, 'S');
      doc.addImage(png.url, 'PNG', x + 1, y, ancho - 2, (alto * (ancho - 2)) / ancho);
      y += alto + 9;
    } else if (s.tipo === 'tabla') {
      if (!s.filas.length) continue;
      s = { ...s, columnas: s.columnas.filter((c) => enDestino(c, 'pdf')) };
      titulo(s, 34);
      const sc = hexARgb(s.color || color);
      const totales = calcularTotales(s);
      const columnStyles = {};
      s.columnas.forEach((c, i) => {
        columnStyles[i] = { halign: esNumerica(c.tipo) ? 'right' : 'left', ...(c.anchoPDF ? { cellWidth: c.anchoPDF } : {}) };
      });
      autoTable(doc, {
        startY: y,
        head: [s.columnas.map((c) => c.titulo)],
        body: s.filas.map((f) => s.columnas.map((c) => textoCelda(f[c.clave], c.tipo))),
        foot: totales ? [s.columnas.map((c) => (typeof totales[c.clave] === 'number' ? textoCelda(totales[c.clave], c.tipo) : (totales[c.clave] ?? '')))] : undefined,
        showFoot: 'lastPage',
        theme: 'grid',
        margin: { left: M, right: M, top: ARRIBA, bottom: 18 },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.3, textColor: hexARgb(MARCA.pizarra), lineColor: hexARgb(MARCA.borde), lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: sc, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.3, lineColor: sc },
        footStyles: { fillColor: hexARgb(aclarar(s.color || color, 0.86)), textColor: hexARgb(MARCA.tinta), fontStyle: 'bold' },
        alternateRowStyles: { fillColor: hexARgb(MARCA.fondo) },
        columnStyles,
        didParseCell: (d) => {
          if (d.section === 'head' || d.section === 'foot') d.cell.styles.halign = columnStyles[d.column.index]?.halign || 'left';
          if (d.section !== 'body') return;
          const col = s.columnas[d.column.index];
          const chip = col?.colores?.[s.filas[d.row.index]?.[col.clave]];
          if (chip) { d.cell.styles.textColor = hexARgb(chip); d.cell.styles.fontStyle = 'bold'; }
        },
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // ── Encabezado (páginas 2+) y pie de página ──
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFillColor(...rgb);
      doc.rect(0, 0, W, 1.6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      tinta();
      doc.text(reporte.titulo, M, 11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...hexARgb(MARCA.gris));
      doc.text(reporte.subtitulo || MARCA.app, W - M, 11, { align: 'right' });
      doc.setDrawColor(...hexARgb(MARCA.borde));
      doc.line(M, 14.5, W - M, 14.5);
    }
    doc.setDrawColor(...hexARgb(MARCA.borde));
    doc.line(M, H - 12.5, W - M, H - 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...hexARgb(MARCA.grisClaro));
    doc.text(`${MARCA.app}  ·  Desarrollado por ${MARCA.autor}`, M, H - 8);
    doc.text(`Página ${i} de ${total}`, W - M, H - 8, { align: 'right' });
  }

  descargar(doc.output('blob'), `${nombreSeguro(reporte.archivo)}.pdf`);
}
