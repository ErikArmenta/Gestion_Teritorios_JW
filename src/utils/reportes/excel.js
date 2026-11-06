// Excel con la marca de la app (exceljs, se carga solo al exportar).
// Hoja "Resumen" con logo, título, datos e indicadores; una hoja con formato por cada tabla.
import { MARCA, aclarar, aFecha, calcularTotales, descargar, enDestino, logoPNG, metaCompleta, nombreSeguro } from './comun';

const argb = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`;
const relleno = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const bordeFino = { style: 'thin', color: { argb: argb(MARCA.borde) } };
const BORDES = { top: bordeFino, left: bordeFino, bottom: bordeFino, right: bordeFino };

const FORMATOS = {
  numero: '#,##0',
  decimal: '#,##0.00',
  horas: '#,##0.##',
  porcentaje: '0.0%',
  fecha: 'dd/mm/yyyy',
  fechaHora: 'dd/mm/yyyy hh:mm',
};

function valorExcel(v, tipo) {
  if (v === null || v === undefined || v === '') return null;
  if (tipo === 'fecha' || tipo === 'fechaHora') return aFecha(v) || String(v);
  if (tipo === 'siNo') return v ? 'Sí' : 'No';
  if (['numero', 'decimal', 'horas', 'porcentaje'].includes(tipo)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  }
  return String(v);
}

// Nombres de hoja: máx. 31, sin []:*?/\ y sin repetir
function nombreHoja(nombre, usados) {
  let base = String(nombre || 'Hoja').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let n = base, i = 2;
  while (usados.has(n.toLowerCase())) { n = `${base.slice(0, 28)} ${i++}`; }
  usados.add(n.toLowerCase());
  return n;
}

function encabezado(ws, wb, logoId, reporte, columnasTotal, subtitulo) {
  const ultima = Math.max(4, columnasTotal);
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 16;
  const primeraTexto = logoId != null ? 2 : 1;
  ws.mergeCells(1, primeraTexto, 1, ultima);
  ws.mergeCells(2, primeraTexto, 2, ultima);
  ws.mergeCells(3, primeraTexto, 3, ultima);
  const t = ws.getCell(1, primeraTexto);
  t.value = reporte.titulo;
  t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: argb(MARCA.tinta) } };
  t.alignment = { vertical: 'middle' };
  const s = ws.getCell(2, primeraTexto);
  s.value = [subtitulo || reporte.subtitulo, MARCA.app].filter(Boolean).join(' · ');
  s.font = { size: 11, color: { argb: argb(reporte.color || MARCA.azul) }, bold: true };
  const m = ws.getCell(3, primeraTexto);
  m.value = metaCompleta(reporte).map((x) => `${x.etiqueta}: ${x.valor}`).join('   ·   ');
  m.font = { size: 9, color: { argb: argb(MARCA.gris) } };
  if (logoId != null) {
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 0, 9);
    ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 52, height: 52 } });
  }
  // Línea de color bajo el encabezado
  for (let c = 1; c <= ultima; c++) {
    ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: argb(reporte.color || MARCA.azul) } } };
  }
  ws.getRow(4).height = 6;
}

function anchoColumna(col, filas) {
  if (col.ancho) return col.ancho;
  const largo = Math.max(String(col.titulo).length, ...filas.slice(0, 300).map((f) => String(f[col.clave] ?? '').length));
  return Math.min(48, Math.max(10, largo + 3));
}

// Tabla con formato a partir de la fila `inicio`. Devuelve la fila siguiente libre.
function escribirTabla(ws, seccion, inicio, color, { filtro = true, congelar = false } = {}) {
  const { columnas, filas } = seccion;
  const head = ws.getRow(inicio);
  columnas.forEach((c, i) => {
    const celda = head.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
    celda.fill = relleno(color);
    celda.alignment = { vertical: 'middle', horizontal: ['numero', 'decimal', 'horas', 'porcentaje'].includes(c.tipo) ? 'right' : 'left', wrapText: true };
    celda.border = BORDES;
  });
  head.height = 24;
  filas.forEach((f, idx) => {
    const fila = ws.getRow(inicio + 1 + idx);
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = valorExcel(f[c.clave], c.tipo);
      celda.border = BORDES;
      celda.alignment = { vertical: 'top', wrapText: c.tipo === 'texto' || !c.tipo };
      if (FORMATOS[c.tipo]) celda.numFmt = FORMATOS[c.tipo];
      if (idx % 2 === 1) celda.fill = relleno(MARCA.fondo);
      const colorChip = c.colores?.[f[c.clave]];
      if (colorChip) {
        celda.font = { bold: true, color: { argb: argb(colorChip) } };
        celda.fill = relleno(aclarar(colorChip, 0.86));
      }
    });
  });
  let siguiente = inicio + 1 + filas.length;
  const totales = calcularTotales(seccion);
  if (totales) {
    const fila = ws.getRow(siguiente);
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = valorExcel(totales[c.clave], typeof totales[c.clave] === 'number' ? c.tipo : 'texto');
      if (FORMATOS[c.tipo] && typeof totales[c.clave] === 'number') celda.numFmt = FORMATOS[c.tipo];
      celda.font = { bold: true, color: { argb: argb(MARCA.tinta) } };
      celda.fill = relleno(aclarar(color, 0.88));
      celda.border = { ...BORDES, top: { style: 'medium', color: { argb: argb(color) } } };
    });
    siguiente += 1;
  }
  if (filtro && filas.length) {
    ws.autoFilter = { from: { row: inicio, column: 1 }, to: { row: inicio + filas.length, column: columnas.length } };
  }
  if (congelar) ws.views = [{ state: 'frozen', ySplit: inicio, xSplit: 0 }];
  columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width || 0, anchoColumna(c, filas));
  });
  return siguiente;
}

function configurarImpresion(ws, titulo) {
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: `&L&8${MARCA.app} · ${titulo}&R&8Página &P de &N` };
}

export async function exportarExcel(reporte) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = MARCA.app;
  wb.company = MARCA.autor;
  wb.created = new Date();
  const color = reporte.color || MARCA.azul;
  const logo = await logoPNG();
  const logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;
  const usados = new Set();
  const tablas = (reporte.secciones || []).filter((s) => s.tipo === 'tabla' && enDestino(s, 'excel'));

  // ── Resumen ──
  const res = wb.addWorksheet(nombreHoja('Resumen', usados), { properties: { tabColor: { argb: argb(color) } }, views: [{ showGridLines: false }] });
  encabezado(res, wb, logoId, reporte, 4);
  let fila = 6;
  if (reporte.kpis?.length) {
    const t = res.getCell(fila, 1);
    t.value = 'Indicadores';
    t.font = { bold: true, size: 13, color: { argb: argb(MARCA.tinta) } };
    fila += 1;
    fila = escribirTabla(res, {
      columnas: [{ titulo: 'Indicador', clave: 'etiqueta', ancho: 30 }, { titulo: 'Valor', clave: 'valor', ancho: 16 }, { titulo: 'Detalle', clave: 'detalle', ancho: 44 }],
      filas: reporte.kpis.map((k) => ({ etiqueta: k.etiqueta, valor: k.valor, detalle: k.detalle || '' })),
    }, fila, color, { filtro: false }) + 1;
    // Valor en grande y del color del indicador
    reporte.kpis.forEach((k, i) => {
      const celda = res.getCell(fila - 1 - reporte.kpis.length + i, 2);
      celda.font = { bold: true, size: 12, color: { argb: argb(k.color || MARCA.tinta) } };
      celda.alignment = { horizontal: 'right' };
    });
  }
  const textos = (reporte.secciones || []).filter((s) => s.tipo === 'texto' && enDestino(s, 'excel'));
  textos.forEach((s) => {
    res.getCell(fila, 1).value = s.titulo;
    res.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: argb(MARCA.tinta) } };
    fila += 1;
    s.parrafos.forEach((p) => {
      res.mergeCells(fila, 1, fila, 4);
      const c = res.getCell(fila, 1);
      c.value = p;
      c.alignment = { wrapText: true, vertical: 'top' };
      c.font = { size: 10, color: { argb: argb(MARCA.pizarra) } };
      res.getRow(fila).height = Math.min(120, 15 * Math.ceil(String(p).length / 110));
      fila += 1;
    });
    fila += 1;
  });
  if (tablas.length) {
    res.getCell(fila, 1).value = 'Hojas de este archivo';
    res.getCell(fila, 1).font = { bold: true, size: 11, color: { argb: argb(MARCA.gris) } };
    fila += 1;
  }
  configurarImpresion(res, reporte.titulo);

  // ── Una hoja por tabla ──
  tablas.forEach((seccion) => {
    const s = { ...seccion, columnas: seccion.columnas.filter((c) => enDestino(c, 'excel')) };
    const nombre = nombreHoja(s.hoja || s.titulo, usados);
    if (tablas.length) {
      const c = res.getCell(fila++, 1);
      c.value = { text: `→ ${nombre}  (${s.filas.length} ${s.filas.length === 1 ? 'fila' : 'filas'})`, hyperlink: `#'${nombre}'!A1` };
      c.font = { color: { argb: argb(color) }, underline: true };
    }
    const ws = wb.addWorksheet(nombre, { views: [{ showGridLines: false }] });
    encabezado(ws, wb, logoId, reporte, s.columnas.length, s.titulo);
    let inicio = 6;
    if (s.descripcion) {
      ws.mergeCells(5, 1, 5, Math.max(4, s.columnas.length));
      const d = ws.getCell(5, 1);
      d.value = s.descripcion;
      d.font = { italic: true, size: 9.5, color: { argb: argb(MARCA.gris) } };
      d.alignment = { wrapText: true };
      ws.getRow(5).height = 28;
      inicio = 7;
    }
    escribirTabla(ws, s, inicio, color, { congelar: true });
    if (logoId != null) ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 12);
    configurarImpresion(ws, reporte.titulo);
  });

  const buffer = await wb.xlsx.writeBuffer();
  descargar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nombreSeguro(reporte.archivo)}.xlsx`);
}

// Plantilla para importar: la fila 1 son los encabezados EXACTOS que lee el importador (no moverlos).
// columnas: [{ titulo, ancho, opciones? }] (opciones → lista desplegable)
export async function exportarPlantilla({ archivo, hoja, columnas, ejemplos = [], instrucciones = [] }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = MARCA.app;
  const ws = wb.addWorksheet(hoja, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho || 20 }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = relleno(MARCA.azul);
    celda.alignment = { vertical: 'middle' };
    celda.border = BORDES;
  });
  ejemplos.forEach((e) => {
    const r = ws.addRow(e);
    r.eachCell((celda) => { celda.font = { italic: true, color: { argb: argb(MARCA.gris) } }; celda.border = BORDES; });
  });
  // Listas desplegables desde una hoja oculta (una lista escrita en la celda se rompe con comas o > 255 letras)
  const conLista = columnas.map((c, i) => ({ c, i })).filter(({ c }) => c.opciones?.length);
  let listas = null;
  conLista.forEach(({ c, i }, k) => {
    if (!listas) { listas = wb.addWorksheet('Listas'); listas.state = 'veryHidden'; }
    c.opciones.forEach((op, r) => { listas.getCell(r + 1, k + 1).value = String(op); });
    const letra = String.fromCharCode(65 + k);
    const rango = `Listas!$${letra}$1:$${letra}$${c.opciones.length}`;
    for (let r = 2; r <= 1000; r++) {
      ws.getCell(r, i + 1).dataValidation = {
        type: 'list', allowBlank: true, formulae: [rango],
        showErrorMessage: !c.libre, errorStyle: 'warning', errorTitle: 'Revisa el valor', error: `Usa un valor de la lista de "${c.titulo}".`,
      };
    }
  });
  if (instrucciones.length) {
    const inst = wb.addWorksheet('Instrucciones', { views: [{ showGridLines: false }] });
    inst.getColumn(1).width = 100;
    const t = inst.getCell('A1');
    t.value = `${MARCA.app} · Cómo llenar la plantilla`;
    t.font = { bold: true, size: 15, color: { argb: argb(MARCA.tinta) } };
    instrucciones.forEach((linea, i) => {
      const c = inst.getCell(i + 3, 1);
      c.value = linea;
      c.alignment = { wrapText: true };
      c.font = { size: 11, color: { argb: argb(MARCA.pizarra) } };
    });
  }
  const buffer = await wb.xlsx.writeBuffer();
  descargar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nombreSeguro(archivo)}.xlsx`);
}
