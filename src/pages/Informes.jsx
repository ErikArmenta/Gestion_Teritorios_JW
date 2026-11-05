import React, { useMemo, useState } from 'react';
import {
  ClipboardList, ChevronLeft, ChevronRight, Target, Plus, Trash2, Send, Check, Clock, BookOpen, Repeat,
  Wrench, Pencil, FileSpreadsheet, FileDown, CloudOff, AlertTriangle, Users, Loader2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import useMiInforme from '../hooks/useMiInforme';
import useInformesCongregacion from '../hooks/useInformesCongregacion';
import {
  esPrecursor, METAS_SUGERIDAS, TIPOS_SALIDA, TIPOS_PUBLICADOR, ROLES_VEN_INFORMES, etiquetaTipoSalida,
  hoyLocal, mesActual, sumarMeses, finDeMes, nombreMes, diasRestantes, formatHoras,
} from '../utils/informes';
import { t, getLocale } from '../i18n';

// Informes de servicio (Migración 7, MIGRACION_7_INFORMES.sql).
//  - Mi informe: precursores anotan cada salida (horas por tipo, revisitas, servicio sagrado), ven su avance
//    contra su meta (mes y, el regular, año de servicio) y envían el informe del mes; publicadores marcan
//    "Prediqué este mes" y sus estudios.
//  - Congregación (ancianos, ministeriales, admins): resumen del mes por tipo, quién falta, Excel/PDF.
// Los PDF/Excel exportados quedan en español (regla del proyecto).

const COLOR_TIPO = {
  'Publicador': '#64748B',
  'Precursor auxiliar': '#0891B2',
  'Precursor regular': '#7C3AED',
};

const BadgeTipo = ({ tipo }) => (
  <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
    style={{ background: `${COLOR_TIPO[tipo] || '#64748B'}1F`, color: COLOR_TIPO[tipo] || '#64748B' }}>
    {t(tipo)}
  </span>
);

const fechaCorta = (f) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
const fechaHora = (iso) => new Date(iso).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const BarraAvance = ({ valor, meta, color = '#2563EB' }) => {
  const pct = meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : 0;
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 100 ? '#10B981' : color }} />
    </div>
  );
};

const NavegadorMes = ({ mes, setMes }) => {
  const esActual = mes >= mesActual();
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn btn-outline px-2.5" onClick={() => setMes(sumarMeses(mes, -1))} aria-label={t('Mes anterior')}>
        <ChevronLeft size={16} />
      </button>
      <span className="font-bold text-primary min-w-[150px] text-center">{nombreMes(mes, getLocale())}</span>
      <button type="button" className="btn btn-outline px-2.5" onClick={() => setMes(sumarMeses(mes, 1))} disabled={esActual} aria-label={t('Mes siguiente')}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

// ── Mi informe ─────────────────────────────────────────────────────────────────────

const TarjetaAvance = ({ tipo, perfil, mes, totalesMes, totalesAnio, anio, onGuardarMetas }) => {
  const toast = useToast();
  const sug = METAS_SUGERIDAS[tipo] || { mensual: 0, anual: null };
  const metaMes = Number(perfil?.meta_horas_mensual) || sug.mensual;
  const metaAnio = Number(perfil?.meta_horas_anual) || sug.anual;
  const esRegular = tipo === 'Precursor regular';
  const [editando, setEditando] = useState(false);
  const [mensual, setMensual] = useState(String(metaMes || ''));
  const [anual, setAnual] = useState(String(metaAnio || ''));
  const [guardando, setGuardando] = useState(false);

  const falta = Math.max(0, metaMes - totalesMes.horas);
  const dias = diasRestantes(mes);
  const porDia = dias > 0 ? falta / dias : 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardarMetas({ mensual: Number(mensual) || null, anual: esRegular ? (Number(anual) || null) : null });
      toast.success(t('Meta actualizada'));
      setEditando(false);
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-bold text-primary flex items-center gap-2 m-0"><Target size={18} style={{ color: '#2563EB' }} /> {t('Mi meta')}</h3>
        {!editando && (
          <button type="button" className="btn btn-outline text-xs py-1.5 px-3" onClick={() => setEditando(true)}>
            <Pencil size={13} /> {t('Editar meta')}
          </button>
        )}
      </div>

      {editando ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="form-group flex-1 mb-0">
              <label className="form-label">{t('Horas al mes')}</label>
              <input type="number" min="0" step="1" inputMode="numeric" value={mensual} onChange={e => setMensual(e.target.value)} />
            </div>
            {esRegular && (
              <div className="form-group flex-1 mb-0">
                <label className="form-label">{t('Horas al año de servicio')}</label>
                <input type="number" min="0" step="1" inputMode="numeric" value={anual} onChange={e => setAnual(e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline flex-1" onClick={() => setEditando(false)}>{t('Cancelar')}</button>
            <button type="button" className="btn btn-primary flex-1" onClick={guardar} disabled={guardando}>{t('Guardar')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2 mb-2">
            <div>
              <p className="text-3xl font-extrabold text-primary m-0 leading-none">{formatHoras(totalesMes.horas)}</p>
              <p className="text-xs text-muted mt-1 mb-0">{t('de {meta} h este mes', { meta: metaMes })}</p>
            </div>
            <span className="text-lg font-extrabold" style={{ color: totalesMes.horas >= metaMes ? '#10B981' : '#2563EB' }}>
              {metaMes > 0 ? Math.min(100, Math.round((totalesMes.horas / metaMes) * 100)) : 0}%
            </span>
          </div>
          <BarraAvance valor={totalesMes.horas} meta={metaMes} />
          <p className="text-sm text-secondary mt-2 mb-0">
            {totalesMes.horas >= metaMes
              ? <strong style={{ color: '#059669' }}>{t('¡Meta del mes cumplida!')}</strong>
              : dias > 0
                ? t('Te faltan {falta} · {dias} días · unas {porDia} por día', { falta: formatHoras(falta), dias, porDia: formatHoras(porDia) })
                : t('Te faltaron {falta}', { falta: formatHoras(falta) })}
          </p>

          {esRegular && metaAnio > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-semibold text-primary">{t('Año de servicio {anio}', { anio: anio.etiqueta })}</span>
                <span className="text-secondary">{formatHoras(totalesAnio.horas)} / {metaAnio} h</span>
              </div>
              <BarraAvance valor={totalesAnio.horas} meta={metaAnio} color="#7C3AED" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const FormSalida = ({ mes, onAgregar }) => {
  const toast = useToast();
  const fechaInicial = mes === mesActual() ? hoyLocal() : finDeMes(mes);
  const [fecha, setFecha] = useState(fechaInicial);
  const [categoria, setCategoria] = useState('predicacion');
  const [tipo, setTipo] = useState('casa_en_casa');
  const [h, setH] = useState('1');
  const [m, setM] = useState('0');
  const [revisitas, setRevisitas] = useState(0);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    const horas = Number(h) + Number(m) / 60;
    if (horas <= 0) { toast.warning(t('Escribe cuánto tiempo')); return; }
    if (fecha < mes || fecha > finDeMes(mes)) { toast.warning(t('La fecha debe ser de {mes}', { mes: nombreMes(mes, getLocale()) })); return; }
    setGuardando(true);
    try {
      await onAgregar({
        fecha,
        categoria,
        tipo: categoria === 'predicacion' ? tipo : null,
        horas: Number(horas.toFixed(2)),
        revisitas: categoria === 'predicacion' ? revisitas : 0,
        notas: notas.trim() || null,
      });
      toast.success(navigator.onLine ? t('Salida registrada') : t('Salida guardada sin conexión — se subirá al conectarse'));
      setRevisitas(0); setNotas('');
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const chip = (activo) => `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${activo ? 'text-white' : 'text-primary'}`;

  return (
    <form className="card p-4 sm:p-5" onSubmit={guardar}>
      <h3 className="text-base font-bold text-primary flex items-center gap-2 mb-3"><Plus size={18} style={{ color: '#2563EB' }} /> {t('Registrar salida')}</h3>

      <div className="flex flex-wrap gap-2 mb-3">
        {[['predicacion', t('Predicación'), '#2563EB'], ['servicio_sagrado', t('Servicio sagrado'), '#D97706']].map(([v, etq, color]) => (
          <button key={v} type="button" className={chip(categoria === v)} onClick={() => setCategoria(v)}
            style={categoria === v ? { background: color, borderColor: color } : { background: 'var(--bg-hover)', borderColor: 'var(--border-color)' }}>
            {v === 'predicacion' ? <ClipboardList size={14} /> : <Wrench size={14} />} {etq}
          </button>
        ))}
      </div>

      {categoria === 'predicacion' ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {TIPOS_SALIDA.map(ts => (
            <button key={ts.valor} type="button" className={chip(tipo === ts.valor)} onClick={() => setTipo(ts.valor)}
              style={tipo === ts.valor ? { background: '#0F172A', borderColor: '#0F172A' } : { background: 'var(--bg-hover)', borderColor: 'var(--border-color)' }}>
              {t(ts.etiqueta)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-secondary mb-3">{t('Aseo, mantenimiento y otras labores para Jehová. No suma a las horas de predicación.')}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="form-group mb-0 col-span-2 sm:col-span-1">
          <label className="form-label">{t('Fecha')}</label>
          <input type="date" value={fecha} min={mes} max={finDeMes(mes) < hoyLocal() ? finDeMes(mes) : hoyLocal()} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group mb-0">
          <label className="form-label">{t('Horas')}</label>
          <select value={h} onChange={e => setH(e.target.value)}>
            {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="form-label">{t('Minutos')}</label>
          <select value={m} onChange={e => setM(e.target.value)}>
            {[0, 15, 30, 45].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {categoria === 'predicacion' && (
          <div className="form-group mb-0 col-span-2 sm:col-span-1">
            <label className="form-label">{t('Revisitas')}</label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline px-3" onClick={() => setRevisitas(r => Math.max(0, r - 1))} aria-label="-">−</button>
              <span className="text-lg font-bold text-primary w-8 text-center">{revisitas}</span>
              <button type="button" className="btn btn-outline px-3" onClick={() => setRevisitas(r => r + 1)} aria-label="+">+</button>
            </div>
          </div>
        )}
      </div>

      <div className="form-group mt-3 mb-0">
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder={t('Notas (opcional)')} />
      </div>

      <button type="submit" className="btn btn-primary w-full mt-4" disabled={guardando}>
        {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {t('Guardar salida')}
      </button>
    </form>
  );
};

const ListaSalidas = ({ registros, onEliminar }) => {
  const [borrar, setBorrar] = useState(null);
  if (!registros.length) return null;
  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-base font-bold text-primary flex items-center gap-2 mb-3"><Clock size={18} style={{ color: '#2563EB' }} /> {t('Salidas del mes')} ({registros.length})</h3>
      <div className="flex flex-col gap-2">
        {registros.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: r.categoria === 'servicio_sagrado' ? 'rgba(217,119,6,0.14)' : 'rgba(37,99,235,0.12)', color: r.categoria === 'servicio_sagrado' ? '#D97706' : '#2563EB' }}>
              {r.categoria === 'servicio_sagrado' ? <Wrench size={16} /> : <ClipboardList size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary m-0 truncate">
                {r.categoria === 'servicio_sagrado' ? t('Servicio sagrado') : t(etiquetaTipoSalida(r.tipo))}
                {r._offline && <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: '#D97706' }}><CloudOff size={11} /> {t('Pendiente')}</span>}
              </p>
              <p className="text-xs text-muted m-0 truncate">
                {fechaCorta(r.fecha)}{r.revisitas ? ` · ${t('{n} revisitas', { n: r.revisitas })}` : ''}{r.notas ? ` · ${r.notas}` : ''}
              </p>
            </div>
            <span className="text-sm font-bold text-primary shrink-0">{formatHoras(r.horas)}</span>
            <button type="button" className="p-1.5 rounded-lg shrink-0" style={{ color: '#DC2626' }} onClick={() => setBorrar(r)} aria-label={t('Eliminar')}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {borrar && (
        <ConfirmModal
          message={t('¿Eliminar esta salida?')}
          detail={`${fechaCorta(borrar.fecha)} · ${formatHoras(borrar.horas)}`}
          confirmText={t('Sí, eliminar')}
          cancelText={t('Cancelar')}
          danger
          onConfirm={async () => { const r = borrar; setBorrar(null); await onEliminar(r); }}
          onCancel={() => setBorrar(null)}
        />
      )}
    </div>
  );
};

// Informe del mes. key={mes + envío} en el padre → el estado inicial sale del informe guardado
const TarjetaInforme = ({ precursor, mes, informe, totalesMes, onEnviar }) => {
  const toast = useToast();
  const [predico, setPredico] = useState(informe ? !!informe.predico : false);
  const [estudios, setEstudios] = useState(String(informe?.estudios ?? 0));
  const [comentarios, setComentarios] = useState(informe?.comentarios || '');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await onEnviar({ predico, estudios, comentarios });
      toast.success(navigator.onLine ? t('Informe enviado') : t('Informe guardado sin conexión — se enviará al conectarse'));
    } catch (err) {
      toast.error(t('Error al enviar: ') + (err.message || err));
    } finally {
      setEnviando(false);
    }
  };

  const dato = (Icono, etiqueta, valor, color) => (
    <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
      <Icono size={18} style={{ color }} />
      <div className="min-w-0">
        <p className="text-[11px] text-muted m-0">{etiqueta}</p>
        <p className="text-base font-extrabold text-primary m-0">{valor}</p>
      </div>
    </div>
  );

  return (
    <form className="card p-4 sm:p-5" onSubmit={enviar}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-base font-bold text-primary flex items-center gap-2 m-0"><Send size={18} style={{ color: '#2563EB' }} /> {t('Informe de {mes}', { mes: nombreMes(mes, getLocale()) })}</h3>
        {informe && (
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: informe._offline ? '#D97706' : '#059669' }}>
            {informe._offline ? <><CloudOff size={13} /> {t('Por enviar (sin conexión)')}</> : <><Check size={13} /> {t('Enviado el {fecha}', { fecha: fechaHora(informe.enviado_en) })}</>}
          </span>
        )}
      </div>

      {precursor ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          {dato(Clock, t('Horas de predicación'), formatHoras(totalesMes.horas), '#2563EB')}
          {dato(Repeat, t('Revisitas'), totalesMes.revisitas, '#0891B2')}
          {dato(Wrench, t('Servicio sagrado'), formatHoras(totalesMes.servicioSagrado), '#D97706')}
        </div>
      ) : (
        <label className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer select-none mb-3"
          style={{ background: predico ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)', border: `1.5px solid ${predico ? '#10B981' : 'var(--border-color)'}` }}>
          <input type="checkbox" className="w-5 h-5 accent-emerald-500" style={{ minHeight: 0 }} checked={predico} onChange={e => setPredico(e.target.checked)} />
          <span className="text-base font-bold text-primary">{t('Prediqué este mes')}</span>
        </label>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="form-group mb-0 sm:w-48">
          <label className="form-label flex items-center gap-1.5"><BookOpen size={14} /> {t('Estudios bíblicos')}</label>
          <input type="number" min="0" step="1" inputMode="numeric" value={estudios} onChange={e => setEstudios(e.target.value)} />
        </div>
        <div className="form-group mb-0 flex-1">
          <label className="form-label">{t('Comentarios')}</label>
          <input value={comentarios} onChange={e => setComentarios(e.target.value)} placeholder={t('Opcional')} />
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-full mt-4" disabled={enviando}>
        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {informe ? t('Volver a enviar') : t('Enviar informe')}
      </button>
      {precursor && <p className="text-xs text-muted mt-2 mb-0 text-center">{t('Las horas y revisitas salen de tus salidas del mes.')}</p>}
    </form>
  );
};

const MiInforme = ({ mes, setMes }) => {
  const { user } = useAuth();
  const toast = useToast();
  const { disponible, perfil, registrosMes, totalesMes, totalesAnio, anio, informe, agregarRegistro, eliminarRegistro, guardarMetas, enviarInforme } = useMiInforme(mes);

  if (disponible === null) return <div className="card p-8 flex items-center justify-center gap-2 text-secondary"><Loader2 size={18} className="animate-spin" /> {t('Cargando...')}</div>;
  if (disponible === false) {
    return (
      <div className="card p-5 flex gap-3 items-start" style={{ borderLeft: '4px solid #F59E0B' }}>
        <AlertTriangle size={22} style={{ color: '#D97706' }} className="shrink-0" />
        <div>
          <p className="font-bold text-primary m-0">{t('Los informes aún no están activados')}</p>
          <p className="text-sm text-secondary mt-1 mb-0">
            {ROLES_VEN_INFORMES.includes(user?.rol)
              ? t('Falta correr la Migración 7 (MIGRACION_7_INFORMES.sql) en Supabase.')
              : t('Pide a un administrador que los active.')}
          </p>
        </div>
      </div>
    );
  }

  const tipo = perfil?.tipo_publicador || 'Publicador';
  const precursor = esPrecursor(tipo);
  const eliminar = async (r) => {
    try { await eliminarRegistro(r); toast.success(t('Salida eliminada')); }
    catch (err) { toast.error(navigator.onLine ? t('Error al eliminar: ') + (err.message || err) : t('Necesitas conexión para eliminar una salida ya subida')); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavegadorMes mes={mes} setMes={setMes} />
        <BadgeTipo tipo={tipo} />
      </div>

      {precursor && (
        <>
          <TarjetaAvance
            key={`${tipo}-${perfil?.meta_horas_mensual}-${perfil?.meta_horas_anual}`}
            tipo={tipo} perfil={perfil} mes={mes} totalesMes={totalesMes} totalesAnio={totalesAnio} anio={anio}
            onGuardarMetas={guardarMetas}
          />
          {mes <= mesActual() && <FormSalida key={mes} mes={mes} onAgregar={agregarRegistro} />}
          <ListaSalidas registros={registrosMes} onEliminar={eliminar} />
        </>
      )}

      <TarjetaInforme
        key={`${mes}-${informe?.enviado_en || 'nuevo'}`}
        precursor={precursor} mes={mes} informe={informe} totalesMes={totalesMes} onEnviar={enviarInforme}
      />
    </div>
  );
};

// ── Congregación ───────────────────────────────────────────────────────────────────

const exportarExcel = (mes, filas, resumen) => {
  const nombre = nombreMes(mes, 'es-MX');
  const wb = XLSX.utils.book_new();
  const res = [
    [`Informe de servicio — ${nombre}`], [],
    ['Tipo', 'Miembros', 'Enviaron', 'Predicaron', 'Horas', 'Estudios', 'Revisitas', 'Servicio sagrado (h)'],
    ...TIPOS_PUBLICADOR.map(tp => {
      const r = resumen[tp];
      return [tp, r.total, r.enviados, r.predicaron, Number(r.horas.toFixed(2)), r.estudios, r.revisitas, Number(r.servicioSagrado.toFixed(2))];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), 'Resumen');
  const det = [
    ['Nombre', 'Tipo', 'Enviado', 'Predicó', 'Horas', 'Estudios', 'Revisitas', 'Servicio sagrado (h)', 'Comentarios'],
    ...filas.map(f => [f.nombre, f.tipo, f.enviado ? 'Sí' : 'No', f.predico ? 'Sí' : 'No',
      esPrecursor(f.tipo) ? Number(f.horas.toFixed(2)) : '', f.estudios, esPrecursor(f.tipo) ? f.revisitas : '',
      esPrecursor(f.tipo) ? Number(f.servicioSagrado.toFixed(2)) : '', f.comentarios]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), 'Detalle');
  XLSX.writeFile(wb, `informes_${mes.slice(0, 7)}.xlsx`);
};

const exportarPDF = (mes, filas, resumen) => {
  const nombre = nombreMes(mes, 'es-MX');
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(`Informe de servicio — ${nombre}`, 14, 18);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Generado el ${new Date().toLocaleDateString('es-MX')}`, 14, 25);
  autoTable(doc, {
    startY: 31,
    head: [['Tipo', 'Miembros', 'Enviaron', 'Predicaron', 'Horas', 'Estudios', 'Revisitas', 'Serv. sagrado']],
    body: TIPOS_PUBLICADOR.map(tp => {
      const r = resumen[tp];
      return [tp, r.total, r.enviados, r.predicaron, formatHoras(r.horas), r.estudios, r.revisitas, formatHoras(r.servicioSagrado)];
    }),
    styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Nombre', 'Tipo', 'Enviado', 'Predicó', 'Horas', 'Estudios', 'Revisitas', 'Serv. sagrado']],
    body: filas.map(f => [f.nombre, f.tipo, f.enviado ? 'Sí' : 'No', f.predico ? 'Sí' : 'No',
      esPrecursor(f.tipo) ? formatHoras(f.horas) : '—', f.estudios, esPrecursor(f.tipo) ? f.revisitas : '—',
      esPrecursor(f.tipo) ? formatHoras(f.servicioSagrado) : '—']),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });
  doc.save(`informes_${mes.slice(0, 7)}.pdf`);
};

const InformeCongregacion = ({ mes, setMes }) => {
  const { cargando, filas, resumen } = useInformesCongregacion(mes);
  const [filtro, setFiltro] = useState('todos');

  const visibles = useMemo(() => filas.filter(f =>
    filtro === 'todos' || (filtro === 'pendientes' && !f.enviado) || (filtro === 'precursores' && esPrecursor(f.tipo))),
  [filas, filtro]);
  const pendientes = filas.filter(f => !f.enviado).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavegadorMes mes={mes} setMes={setMes} />
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline text-sm" onClick={() => exportarExcel(mes, filas, resumen)} disabled={!filas.length}>
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button type="button" className="btn btn-outline text-sm" onClick={() => exportarPDF(mes, filas, resumen)} disabled={!filas.length}>
            <FileDown size={15} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIPOS_PUBLICADOR.map(tp => {
          const r = resumen[tp];
          return (
            <div key={tp} className="card p-4" style={{ borderTop: `3px solid ${COLOR_TIPO[tp]}` }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <BadgeTipo tipo={tp} />
                <span className="text-xs text-muted">{t('{e} de {n} enviaron', { e: r.enviados, n: r.total })}</span>
              </div>
              {tp === 'Publicador' ? (
                <p className="text-sm text-secondary m-0">
                  <strong className="text-primary text-xl">{r.predicaron}</strong> {t('predicaron')} · <strong className="text-primary">{r.estudios}</strong> {t('estudios')}
                </p>
              ) : (
                <p className="text-sm text-secondary m-0">
                  <strong className="text-primary text-xl">{formatHoras(r.horas)}</strong> · <strong className="text-primary">{r.estudios}</strong> {t('estudios')} · <strong className="text-primary">{r.revisitas}</strong> {t('revisitas')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {[['todos', t('Todos')], ['pendientes', `${t('Sin enviar')} (${pendientes})`], ['precursores', t('Precursores')]].map(([v, etq]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)}
            className="px-3.5 py-1.5 rounded-full text-sm font-semibold border"
            style={filtro === v ? { background: '#2563EB', borderColor: '#2563EB', color: '#fff' } : { background: 'var(--bg-hover)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {etq}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="card p-8 flex items-center justify-center gap-2 text-secondary"><Loader2 size={18} className="animate-spin" /> {t('Cargando...')}</div>
      ) : visibles.length === 0 ? (
        <div className="card p-8 text-center text-secondary"><Users size={28} className="mx-auto mb-2 opacity-50" /> {t('No hay miembros en esta lista')}</div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted" style={{ background: 'var(--bg-hover)' }}>
                  <th className="px-4 py-3">{t('Nombre')}</th><th className="px-3 py-3">{t('Tipo')}</th><th className="px-3 py-3">{t('Estado')}</th>
                  <th className="px-3 py-3">{t('Predicó')}</th><th className="px-3 py-3 text-right">{t('Horas')}</th><th className="px-3 py-3 text-right">{t('Estudios')}</th>
                  <th className="px-3 py-3 text-right">{t('Revisitas')}</th><th className="px-4 py-3 text-right">{t('Serv. sagrado')}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(f => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td className="px-4 py-3 font-semibold text-primary">{f.nombre}</td>
                    <td className="px-3 py-3"><BadgeTipo tipo={f.tipo} /></td>
                    <td className="px-3 py-3">
                      {f.enviado
                        ? <span className="text-xs font-bold" style={{ color: '#059669' }}><Check size={12} className="inline" /> {t('Enviado')}</span>
                        : <span className="text-xs font-bold" style={{ color: '#D97706' }}>{t('Sin enviar')}</span>}
                    </td>
                    <td className="px-3 py-3 text-secondary">{f.predico ? t('Sí') : t('No')}</td>
                    <td className="px-3 py-3 text-right text-primary">{esPrecursor(f.tipo) ? formatHoras(f.horas) : '—'}</td>
                    <td className="px-3 py-3 text-right text-primary">{f.estudios}</td>
                    <td className="px-3 py-3 text-right text-primary">{esPrecursor(f.tipo) ? f.revisitas : '—'}</td>
                    <td className="px-4 py-3 text-right text-primary">{esPrecursor(f.tipo) ? formatHoras(f.servicioSagrado) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <div className="flex flex-col gap-2 md:hidden">
            {visibles.map(f => (
              <div key={f.id} className="card p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-bold text-primary truncate">{f.nombre}</span>
                  {f.enviado
                    ? <span className="text-xs font-bold shrink-0" style={{ color: '#059669' }}>{t('Enviado')}</span>
                    : <span className="text-xs font-bold shrink-0" style={{ color: '#D97706' }}>{t('Sin enviar')}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-secondary">
                  <BadgeTipo tipo={f.tipo} />
                  {esPrecursor(f.tipo)
                    ? <span>{formatHoras(f.horas)} · {f.estudios} {t('estudios')} · {f.revisitas} {t('revisitas')}</span>
                    : <span>{f.predico ? t('Predicó') : t('No predicó')} · {f.estudios} {t('estudios')}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ── Pantalla ───────────────────────────────────────────────────────────────────────

const Informes = () => {
  const { user } = useAuth();
  const puedeVerCongregacion = ROLES_VEN_INFORMES.includes(user?.rol);
  const [pestana, setPestana] = useState('mio');
  const [mes, setMes] = useState(mesActual);

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0 flex items-center gap-2"><ClipboardList size={26} /> {t('Informes')}</h1>
        <p className="text-sm mt-0.5 text-secondary">{t('Tu actividad del mes y el informe de servicio')}</p>
      </div>

      {puedeVerCongregacion && (
        <div className="flex gap-1 p-1 rounded-xl mb-5 max-w-md" style={{ background: 'var(--bg-hover)' }}>
          {[['mio', t('Mi informe')], ['congregacion', t('Congregación')]].map(([v, etq]) => (
            <button key={v} type="button" onClick={() => setPestana(v)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={pestana === v ? { background: 'var(--bg-card)', color: '#2563EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: 'var(--text-secondary)' }}>
              {etq}
            </button>
          ))}
        </div>
      )}

      {pestana === 'congregacion' && puedeVerCongregacion
        ? <InformeCongregacion mes={mes} setMes={setMes} />
        : <MiInforme mes={mes} setMes={setMes} />}
      <div className="h-6" />
    </div>
  );
};

export default Informes;
