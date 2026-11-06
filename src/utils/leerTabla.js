// Lee un .xlsx o .csv como filas de texto (arreglo de arreglos, la fila 1 incluida), igual que hacía
// SheetJS con sheet_to_json({ header: 1, defval: '' }). Para importar casas (HousesList).
// .xlsx con exceljs (se carga solo al importar); .csv con un lector propio (comas o punto y coma, comillas).

const textoCelda = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text ?? '');          // hipervínculo
    if ('result' in v) return textoCelda(v.result);       // fórmula
    if ('error' in v) return '';
    return '';
  }
  return String(v);
};

async function leerXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // La primera hoja visible (la plantilla trae una hoja oculta de listas)
  const ws = wb.worksheets.find((w) => w.state === 'visible') || wb.worksheets[0];
  if (!ws) return [];
  const columnas = ws.columnCount;
  const filas = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const fila = ws.getRow(r);
    const valores = [];
    for (let c = 1; c <= columnas; c++) valores.push(textoCelda(fila.getCell(c).value).trim());
    filas.push(valores);
  }
  return filas;
}

// CSV: detecta separador (; o ,), respeta comillas ("a, b" y comillas dobles "")
export function leerCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo.trim()); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return filas;
}

// Texto del CSV: UTF-8; si trae caracteres inválidos (Excel en Windows guarda en ANSI), windows-1252
function decodificar(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('windows-1252').decode(buffer); } catch { return utf8; }
}

export async function leerTabla(file) {
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return leerCsv(decodificar(buffer));
  return leerXlsx(buffer);
}
