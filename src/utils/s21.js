// Registro de publicador de la congregación (S-21): llena el formulario oficial (public/formularios/S-21-S.pdf,
// con campos rellenables) con los informes del año de servicio (septiembre–agosto).
// - Una persona: se llenan los CAMPOS del formulario (queda editable).
// - Todos: una hoja por persona sobre la MISMA página de fondo (las fuentes del formulario no se repiten:
//   100 publicadores ≈ 1 MB, no 50 MB) con el texto escrito en la posición exacta de cada campo.
// Funciona en el navegador y en Node (pruebas): recibe los bytes del formulario.

export const MESES_S21 = ['Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto'];
export const ROLES_S21 = ['Super Admin', 'Admin Principal', 'Anciano'];

// Campos del formulario S-21-S (11/23). Filas 20…31 = septiembre…agosto, 32 = total.
const F = {
  nombre: '900_1_Text_SanSerif',
  nacimiento: '900_2_Text_SanSerif',
  hombre: '900_3_CheckBox',
  mujer: '900_4_CheckBox',
  bautismo: '900_5_Text_SanSerif',
  otrasOvejas: '900_6_CheckBox',
  ungido: '900_7_CheckBox',
  anciano: '900_8_CheckBox',
  siervo: '900_9_CheckBox',
  regular: '900_10_CheckBox',
  especial: '900_11_CheckBox',
  misionero: '900_12_CheckBox',
  anio: '900_13_Text_C_SanSerif',
  participo: (i) => `901_${20 + i}_CheckBox`,
  estudios: (i) => `902_${20 + i}_Text_C_SanSerif`,
  auxiliar: (i) => `903_${20 + i}_CheckBox`,
  horas: (i) => `904_${20 + i}_S21_Value`,
  notas: (i) => `905_${20 + i}_Text_SanSerif`,
  totalHoras: '904_32_S21_Value',
  totalNotas: '905_32_Text_SanSerif',
};

const PRECURSOR_HORAS = ['Precursor regular', 'Precursor auxiliar'];

// Mes 'YYYY-MM-01' de cada fila: año de servicio que termina en `anio` (sept anio-1 … ago anio)
export const mesesDelAnio = (anio) => MESES_S21.map((_, i) => {
  const m = ((8 + i) % 12) + 1;
  const y = i < 4 ? anio - 1 : anio;
  return `${y}-${String(m).padStart(2, '0')}-01`;
});
// Año de servicio (el que termina) de un mes 'YYYY-MM-..'
export const anioServicioDe = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return m >= 9 ? y + 1 : y;
};

const fecha = (d) => {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return y && m && dd ? `${dd}/${m}/${y}` : '';
};
const horasTxt = (h) => {
  const n = Number(h) || 0;
  if (!n) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};
// La fuente estándar del PDF solo tiene letras latinas (WinAnsi): se quita lo demás (emojis, etc.)
const limpio = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/ {2,}/g, ' ').trim();

/**
 * Datos de una hoja.
 * miembro: { nombre, tipo_publicador }
 * registro: fila de publicador_registro (o null)
 * informes: { 'YYYY-MM-01': { predico, estudios, horas, tipo_publicador, comentarios, horas_servicio_sagrado } }
 */
export function armarHojaS21(miembro, registro, informes, anio) {
  const r = registro || {};
  const especial = r.servicio_especial || null;
  const meses = mesesDelAnio(anio).map((mes) => {
    const inf = informes?.[mes];
    if (!inf) return { mes, participo: false, estudios: '', auxiliar: false, horas: '', notas: '' };
    const conHoras = PRECURSOR_HORAS.includes(inf.tipo_publicador) || !!especial;
    const horas = conHoras ? Number(inf.horas) || 0 : 0;
    const notas = [
      limpio(inf.comentarios),
      Number(inf.horas_servicio_sagrado) > 0 ? `S. sagrado ${horasTxt(inf.horas_servicio_sagrado)} h` : '',
    ].filter(Boolean).join(' · ');
    return {
      mes,
      participo: !!inf.predico || horas > 0,
      estudios: Number(inf.estudios) > 0 ? String(inf.estudios) : '',
      auxiliar: inf.tipo_publicador === 'Precursor auxiliar',
      horas: horasTxt(horas),
      horasNum: horas,
      notas: notas.slice(0, 70),
    };
  });
  const total = meses.reduce((s, m) => s + (m.horasNum || 0), 0);
  return {
    nombre: limpio(miembro.nombre),
    nacimiento: fecha(r.fecha_nacimiento),
    bautismo: fecha(r.fecha_bautismo),
    hombre: r.sexo === 'Hombre',
    mujer: r.sexo === 'Mujer',
    otrasOvejas: r.esperanza === 'Otras ovejas',
    ungido: r.esperanza === 'Ungido',
    anciano: r.nombramiento === 'Anciano',
    siervo: r.nombramiento === 'Siervo ministerial',
    regular: miembro.tipo_publicador === 'Precursor regular' && !especial,
    especial: especial === 'Precursor especial',
    misionero: especial === 'Misionero que sirve en el campo',
    anio: String(anio),
    meses,
    totalHoras: horasTxt(total),
  };
}

// Qué falta capturar para que la hoja quede completa
export const faltantesS21 = (registro) => {
  const r = registro || {};
  return [!r.sexo && 'sexo', !r.fecha_nacimiento && 'nacimiento', !r.fecha_bautismo && 'bautismo', !r.esperanza && 'esperanza'].filter(Boolean);
};

// ── Generar ──
async function cargarPdfLib() {
  return import('pdf-lib');
}

// Una persona, campos llenos y editables
export async function s21Editable(plantilla, hoja) {
  const { PDFDocument, StandardFonts } = await cargarPdfLib();
  const doc = await PDFDocument.load(plantilla);
  const form = doc.getForm();
  const texto = (n, v) => { try { form.getTextField(n).setText(v || ''); } catch { /* campo distinto */ } };
  const marca = (n, v) => { try { const c = form.getCheckBox(n); if (v) c.check(); else c.uncheck(); } catch { /* */ } };
  texto(F.nombre, hoja.nombre); texto(F.nacimiento, hoja.nacimiento); texto(F.bautismo, hoja.bautismo); texto(F.anio, hoja.anio);
  ['hombre', 'mujer', 'otrasOvejas', 'ungido', 'anciano', 'siervo', 'regular', 'especial', 'misionero'].forEach((k) => marca(F[k], hoja[k]));
  hoja.meses.forEach((m, i) => {
    marca(F.participo(i), m.participo); texto(F.estudios(i), m.estudios); marca(F.auxiliar(i), m.auxiliar);
    texto(F.horas(i), m.horas); texto(F.notas(i), m.notas);
  });
  texto(F.totalHoras, hoja.totalHoras);
  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  doc.setTitle(`S-21 ${hoja.nombre} ${hoja.anio}`);
  return doc.save();
}

// Todos: una hoja por persona sobre la misma página de fondo (texto dibujado; sin campos)
export async function s21Todos(plantilla, hojas) {
  const { PDFDocument, StandardFonts, PDFName, PDFArray, rgb } = await cargarPdfLib();
  const base = await PDFDocument.load(plantilla);
  // Rectángulos de cada campo
  const rect = {};
  for (const c of base.getForm().getFields()) {
    const r = c.acroField.getWidgets()[0]?.getRectangle();
    if (r) rect[c.getName()] = r;
  }
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const palomita = await doc.embedFont(StandardFonts.ZapfDingbats);
  // Copiar la página n veces en UNA llamada: los objetos (fuentes) se comparten
  const paginas = await doc.copyPages(base, hojas.map(() => 0));
  const negro = rgb(0.05, 0.05, 0.1);
  hojas.forEach((hoja, k) => {
    const p = doc.addPage(paginas[k]);
    p.node.delete(PDFName.of('Annots')); // sin los campos vacíos encima del texto
    // Las copias comparten la lista de contenido: cada hoja necesita la suya (si no, el texto de una
    // persona sale encimado en todas). El dibujo del formulario se sigue compartiendo (archivo ligero).
    const contenido = p.node.get(PDFName.of('Contents'));
    const lista = doc.context.lookup(contenido);
    const refs = lista instanceof PDFArray ? lista.asArray() : [contenido];
    p.node.set(PDFName.of('Contents'), doc.context.obj(refs));
    const escribir = (n, v, { centro = false, tam = 10.5 } = {}) => {
      const r = rect[n];
      if (!r || !v) return;
      let t = String(v);
      let size = tam;
      while (size > 5.5 && fuente.widthOfTextAtSize(t, size) > r.width - 4) size -= 0.5;
      while (t.length > 1 && fuente.widthOfTextAtSize(t, size) > r.width - 4) t = `${t.slice(0, -2)}…`;
      const w = fuente.widthOfTextAtSize(t, size);
      p.drawText(t, { x: centro ? r.x + (r.width - w) / 2 : r.x + 2, y: r.y + (r.height - size) / 2 + 1.5, size, font: fuente, color: negro });
    };
    const marcar = (n, v) => {
      const r = rect[n];
      if (!r || !v) return;
      const size = Math.min(r.width, r.height) * 0.95;
      const marca = '✔'; // ✔ en ZapfDingbats
      p.drawText(marca, { x: r.x + (r.width - palomita.widthOfTextAtSize(marca, size)) / 2, y: r.y + (r.height - size * 0.75) / 2, size, font: palomita, color: negro });
    };
    escribir(F.nombre, hoja.nombre, { tam: 11.5 }); escribir(F.nacimiento, hoja.nacimiento); escribir(F.bautismo, hoja.bautismo);
    escribir(F.anio, hoja.anio, { centro: true, tam: 11 });
    ['hombre', 'mujer', 'otrasOvejas', 'ungido', 'anciano', 'siervo', 'regular', 'especial', 'misionero'].forEach((key) => marcar(F[key], hoja[key]));
    hoja.meses.forEach((m, i) => {
      marcar(F.participo(i), m.participo); escribir(F.estudios(i), m.estudios, { centro: true }); marcar(F.auxiliar(i), m.auxiliar);
      escribir(F.horas(i), m.horas, { centro: true }); escribir(F.notas(i), m.notas, { tam: 8.5 });
    });
    escribir(F.totalHoras, hoja.totalHoras, { centro: true, tam: 11 });
  });
  doc.setTitle(`S-21 · Registro de publicador · ${hojas[0]?.anio || ''}`);
  doc.setCreator('Gestión Territorial');
  return doc.save();
}
