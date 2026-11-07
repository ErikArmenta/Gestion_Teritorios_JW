// Genera S-21 de ejemplo con el código real (src/utils/s21.js) para revisarlos
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const [, , RAIZ, SALIDA] = process.argv;
const { armarHojaS21, s21Todos, s21Editable, mesesDelAnio } = await import(pathToFileURL(path.join(RAIZ, 'src/utils/s21.js')).href);
const plantilla = new Uint8Array(fs.readFileSync(path.join(RAIZ, 'public/formularios/S-21-S.pdf')));
const meses = mesesDelAnio(2026);
const informes = {};
meses.forEach((m, i) => { informes[m] = { predico: i !== 3, estudios: i % 3, horas: i < 6 ? 30 + i * 2.5 : 0, tipo_publicador: i < 6 ? 'Precursor auxiliar' : 'Publicador', comentarios: i === 1 ? 'Asamblea de circuito · sirvió en limpieza 🙂' : '', horas_servicio_sagrado: i === 2 ? 4 : 0 }; });
const hojas = [
  armarHojaS21({ nombre: 'María José Núñez Peña', tipo_publicador: 'Publicador' }, { sexo: 'Mujer', fecha_nacimiento: '1985-03-14', fecha_bautismo: '2001-07-20', esperanza: 'Otras ovejas' }, informes, 2026),
  armarHojaS21({ nombre: 'Daniel Armenta', tipo_publicador: 'Precursor regular' }, { sexo: 'Hombre', fecha_nacimiento: '1990-01-02', fecha_bautismo: '2005-05-05', esperanza: 'Otras ovejas', nombramiento: 'Anciano' },
    Object.fromEntries(meses.map((m) => [m, { predico: true, estudios: 3, horas: 50, tipo_publicador: 'Precursor regular', comentarios: '' }])), 2026),
];
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 's21-todos.pdf'), await s21Todos(plantilla, hojas));
fs.writeFileSync(path.join(SALIDA, 's21-uno.pdf'), await s21Editable(plantilla, hojas[0]));
console.log('ok', JSON.stringify(hojas[0].meses.slice(0, 4)));
