import React, { useMemo, useState } from 'react';
import { X, FileText, Download, Loader2, Pencil, Search, AlertCircle, CheckCircle2, Save } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { useToast } from './Toast';
import useRegistroS21 from '../hooks/useRegistroS21';
import { armarHojaS21, faltantesS21, anioServicioDe } from '../utils/s21';
import { mesActual } from '../utils/informes';
import { descargar, nombreSeguro } from '../utils/reportes/comun';
import { t } from '../i18n';

// Informes → Congregación → "S-21": llena el Registro de publicador de la congregación (formulario oficial)
// con los informes del año de servicio. Una persona (editable) o todos en un solo PDF.
// Los datos personales (fechas, sexo, etc.) solo los ve y captura el secretario/ancianos/admins (Migración 15).

const OPCIONES = {
  sexo: ['Hombre', 'Mujer'],
  esperanza: ['Otras ovejas', 'Ungido'],
  nombramiento: ['Anciano', 'Siervo ministerial'],
  servicio_especial: ['Precursor especial', 'Misionero que sirve en el campo'],
};
const ETIQUETA_FALTA = { sexo: 'sexo', nacimiento: 'nacimiento', bautismo: 'bautismo', esperanza: 'esperanza' };

let plantillaCache = null;
const plantilla = async () => {
  if (!plantillaCache) {
    const res = await fetch('/formularios/S-21-S.pdf');
    if (!res.ok) throw new Error(t('No se encontró el formulario S-21'));
    plantillaCache = new Uint8Array(await res.arrayBuffer());
  }
  return plantillaCache;
};

// Nombramiento sugerido por el rol de la app (si aún no se captura)
const sugerido = (m, r) => r?.nombramiento || (m.rol === 'Anciano' ? 'Anciano' : m.rol === 'Ministerial' ? 'Siervo ministerial' : '');

function FormDatos({ miembro, registro, onGuardar, onCancelar }) {
  const [d, setD] = useState({
    sexo: registro?.sexo || '', fecha_nacimiento: registro?.fecha_nacimiento || '', fecha_bautismo: registro?.fecha_bautismo || '',
    esperanza: registro?.esperanza || 'Otras ovejas', nombramiento: sugerido(miembro, registro), servicio_especial: registro?.servicio_especial || '',
  });
  const [guardando, setGuardando] = useState(false);
  const campo = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const botones = (k, ops) => (
    <div className="flex flex-wrap gap-1.5">
      {ops.map((o) => (
        <button key={o} type="button" onClick={() => campo(k, d[k] === o ? '' : o)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border"
          style={d[k] === o ? { background: '#2563EB', borderColor: '#2563EB', color: '#fff' } : { background: '#F8FAFC', borderColor: '#E2E8F0', color: '#334155' }}>
          {t(o)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="mt-2 p-3 rounded-xl flex flex-col gap-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-secondary flex flex-col gap-1">{t('Fecha de nacimiento')}
          <input type="date" value={d.fecha_nacimiento} onChange={(e) => campo('fecha_nacimiento', e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-secondary flex flex-col gap-1">{t('Fecha de bautismo')}
          <input type="date" value={d.fecha_bautismo} onChange={(e) => campo('fecha_bautismo', e.target.value)} />
        </label>
      </div>
      <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-secondary">{t('Sexo')}</span>{botones('sexo', OPCIONES.sexo)}</div>
      <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-secondary">{t('Esperanza')}</span>{botones('esperanza', OPCIONES.esperanza)}</div>
      <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-secondary">{t('Nombramiento')}</span>{botones('nombramiento', OPCIONES.nombramiento)}</div>
      <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-secondary">{t('Servicio especial')}</span>{botones('servicio_especial', OPCIONES.servicio_especial)}</div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-outline text-sm" onClick={onCancelar}>{t('Cancelar')}</button>
        <button type="button" className="btn btn-primary text-sm" disabled={guardando}
          onClick={async () => { setGuardando(true); try { await onGuardar(d); } finally { setGuardando(false); } }}>
          {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {t('Guardar')}
        </button>
      </div>
    </div>
  );
}

export default function RegistroS21({ mes, onClose }) {
  const toast = useToast();
  const actual = anioServicioDe(mesActual());
  const [anio, setAnio] = useState(anioServicioDe(mes || mesActual()));
  const { cargando, disponible, miembros, registros, informes, guardar } = useRegistroS21(anio);
  const [buscar, setBuscar] = useState('');
  const [editando, setEditando] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return miembros.filter((m) => !q || String(m.nombre || '').toLowerCase().includes(q));
  }, [miembros, buscar]);
  const incompletos = miembros.filter((m) => faltantesS21(registros[m.id]).length).length;

  const hoja = (m) => armarHojaS21(m, registros[m.id] ? registros[m.id] : { nombramiento: sugerido(m, null) || null }, informes[m.id], anio);

  const bajarTodos = async () => {
    setOcupado('todos');
    try {
      const { s21Todos } = await import('../utils/s21');
      const bytes = await s21Todos(await plantilla(), miembros.map(hoja));
      descargar(new Blob([bytes], { type: 'application/pdf' }), `S-21_${anio}_todos.pdf`);
      toast.success(t('S-21 de {n} publicadores descargado', { n: miembros.length }));
    } catch (err) {
      toast.error(t('No se pudo generar el archivo: ') + (err?.message || err));
    } finally { setOcupado(null); }
  };
  const bajarUno = async (m) => {
    setOcupado(m.id);
    try {
      const { s21Editable } = await import('../utils/s21');
      const bytes = await s21Editable(await plantilla(), hoja(m));
      descargar(new Blob([bytes], { type: 'application/pdf' }), `S-21_${anio}_${nombreSeguro(m.nombre)}.pdf`);
    } catch (err) {
      toast.error(t('No se pudo generar el archivo: ') + (err?.message || err));
    } finally { setOcupado(null); }
  };

  return (
    <ModalOverlay onClose={onClose} size="large">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {/* La ventana siempre es blanca: título oscuro fijo (el degradado del modo oscuro no se ve aquí) */}
          <h2 className="text-lg font-bold m-0 flex items-center gap-2" style={{ color: '#0F172A' }}><FileText size={20} style={{ color: '#2563EB' }} /> {t('Registro de publicador (S-21)')}</h2>
          <p className="text-xs text-secondary m-0 mt-1">{t('Se llena solo con los informes de septiembre a agosto. Los datos personales solo los ve el secretario y los ancianos.')}</p>
        </div>
        <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0" style={{ color: '#64748B' }} aria-label={t('Cerrar')}><X size={16} /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="text-sm" style={{ width: 'auto' }} aria-label={t('Año de servicio')}>
          {[actual, actual - 1, actual - 2].map((a) => <option key={a} value={a}>{t('Año de servicio {a}', { a })} ({a - 1}–{a})</option>)}
        </select>
        <button type="button" className="btn btn-primary text-sm" onClick={bajarTodos} disabled={cargando || !miembros.length || !!ocupado}>
          {ocupado === 'todos' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {t('Descargar todos ({n})', { n: miembros.length })}
        </button>
      </div>

      {!disponible && (
        <p className="text-xs rounded-lg p-2 mb-3" style={{ background: '#FEF3C7', color: '#92400E' }}>
          {t('Falta correr la Migración 15 en Supabase: los S-21 salen sin fechas ni datos personales.')}
        </p>
      )}
      {disponible && incompletos > 0 && !cargando && (
        <p className="text-xs rounded-lg p-2 mb-3 flex items-center gap-1.5" style={{ background: '#FEF3C7', color: '#92400E' }}>
          <AlertCircle size={14} className="shrink-0" /> {t('A {n} les faltan datos (fechas, sexo o esperanza). Sus hojas salen con esos espacios en blanco.', { n: incompletos })}
        </p>
      )}

      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar nombre')} style={{ paddingLeft: 34 }} />
      </div>

      {cargando ? (
        <p className="text-sm text-secondary flex items-center gap-2 py-6 justify-center"><Loader2 size={16} className="animate-spin" /> {t('Cargando...')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 m-0 p-0" style={{ listStyle: 'none' }}>
          {visibles.map((m) => {
            const falta = faltantesS21(registros[m.id]);
            const meses = Object.keys(informes[m.id] || {}).length;
            return (
              <li key={m.id} className="rounded-xl px-3 py-2" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold m-0 truncate" style={{ color: '#0F172A' }}>{m.nombre}</p>
                    <p className="text-xs m-0 flex flex-wrap items-center gap-1" style={{ color: '#64748B' }}>
                      {t(m.tipo_publicador || 'Publicador')} · {t('{n} de 12 meses', { n: meses })} ·{' '}
                      {falta.length
                        ? <span style={{ color: '#B45309' }}>{t('Falta')}: {falta.map((f) => t(ETIQUETA_FALTA[f])).join(', ')}</span>
                        : <span style={{ color: '#059669' }} className="inline-flex items-center gap-0.5"><CheckCircle2 size={12} /> {t('Completo')}</span>}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {disponible && (
                      <button type="button" className="btn btn-outline text-xs py-1.5 px-2.5" onClick={() => setEditando(editando === m.id ? null : m.id)} title={t('Datos')}>
                        <Pencil size={13} /> <span className="hidden sm:inline">{t('Datos')}</span>
                      </button>
                    )}
                    <button type="button" className="btn btn-outline text-xs py-1.5 px-2.5" onClick={() => bajarUno(m)} disabled={!!ocupado} title={t('PDF de esta persona (editable)')}>
                      {ocupado === m.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} PDF
                    </button>
                  </div>
                </div>
                {editando === m.id && (
                  <FormDatos miembro={m} registro={registros[m.id]} onCancelar={() => setEditando(null)}
                    onGuardar={async (d) => {
                      try { await guardar(m.id, d); toast.success(t('Datos guardados')); setEditando(null); }
                      catch (err) { toast.error(t('Error al guardar: ') + (err?.message || err)); }
                    }} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ModalOverlay>
  );
}
