import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, ChevronLeft, ChevronRight, Target, Plus, Minus, Trash2, Send, Check, Clock, BookOpen, Repeat,
  Wrench, Pencil, CloudOff, AlertTriangle, Users, Loader2,
  Activity, UserCheck, UserX, Hourglass, Search, MapPin,
} from 'lucide-react';
import BotonesExportar from '../components/BotonesExportar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import useMiInforme from '../hooks/useMiInforme';
import useInformesCongregacion from '../hooks/useInformesCongregacion';
import useActividadCongregacion from '../hooks/useActividadCongregacion';
import {
  esPrecursor, METAS_SUGERIDAS, TIPOS_SALIDA, TIPOS_PUBLICADOR, ROLES_VEN_INFORMES, etiquetaTipoSalida,
  hoyLocal, mesActual, sumarMeses, finDeMes, nombreMes, diasRestantes, formatHoras, MESES_INACTIVIDAD_OPCIONES,
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
          <Desglose totales={totalesMes} />

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

// Desglose del mes por concepto (cartas, exhibidor…) + servicio sagrado aparte
const Desglose = ({ totales }) => {
  const items = [...TIPOS_SALIDA, { valor: 'otro', etiqueta: 'Otro' }].filter(ts => (totales.porTipo?.[ts.valor] || 0) > 0);
  if (!items.length && !(totales.servicioSagrado > 0)) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {items.map(ts => (
        <span key={ts.valor} className="text-xs font-semibold px-2.5 py-1 rounded-full text-primary"
          style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.28)' }}>
          {t(ts.etiqueta)} · <strong>{formatHoras(totales.porTipo[ts.valor])}</strong>
        </span>
      ))}
      {totales.servicioSagrado > 0 && (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-primary"
          style={{ background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)' }}>
          {t('Servicio sagrado')} · <strong>{formatHoras(totales.servicioSagrado)}</strong> <span className="text-muted">({t('aparte')})</span>
        </span>
      )}
    </div>
  );
};

const SAGRADO = { valor: 'servicio_sagrado', etiqueta: 'Servicio sagrado' };
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);
const tiempoVacio = () => ({ h: '0', m: '0' });
const aHoras = (v) => (Number(v?.h) || 0) + (Number(v?.m) || 0) / 60;

// Horas libres (se escriben o con − / +) y minutos de 5 en 5
const CampoTiempo = ({ etiqueta, icono, color, valor, onChange }) => {
  const total = aHoras(valor);
  const ponerH = (n) => onChange({ ...valor, h: String(Math.max(0, Math.min(24, n))) });
  return (
    <div className="p-3 rounded-xl flex flex-col gap-2 min-w-0"
      style={{ background: 'var(--bg-hover)', border: `1.5px solid ${total > 0 ? color : 'var(--border-color)'}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-primary flex items-center gap-1.5 min-w-0 truncate">{icono}{etiqueta}</span>
        <span className="text-xs font-bold shrink-0" style={{ color: total > 0 ? color : 'var(--text-muted)' }}>{formatHoras(total)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className="btn btn-outline px-2.5 shrink-0" onClick={() => ponerH((Number(valor.h) || 0) - 1)} aria-label={t('Una hora menos')}>
          <Minus size={14} />
        </button>
        <input type="number" min="0" max="24" step="1" inputMode="numeric" value={valor.h} aria-label={t('Horas')}
          className="text-center font-bold min-w-0 flex-1 px-1"
          onFocus={e => e.target.select()}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            onChange({ ...valor, h: v === '' ? '' : String(Math.min(24, Number(v))) });
          }}
          onBlur={() => { if (valor.h === '') onChange({ ...valor, h: '0' }); }} />
        <span className="text-xs text-muted shrink-0">h</span>
        <button type="button" className="btn btn-outline px-2.5 shrink-0" onClick={() => ponerH((Number(valor.h) || 0) + 1)} aria-label={t('Una hora más')}>
          <Plus size={14} />
        </button>
        <select value={valor.m} onChange={e => onChange({ ...valor, m: e.target.value })} className="w-[64px] shrink-0 px-2" aria-label={t('Minutos')}>
          {MINUTOS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="text-xs text-muted shrink-0">min</span>
      </div>
    </div>
  );
};

// Una casilla de tiempo por concepto (todas en 0); al guardar se crea una salida por cada concepto con
// tiempo y todo se suma. soloSagrado = publicadores (solo anotan servicio sagrado).
const FormSalida = ({ mes, registrosMes, onAgregar, contarVisitasDelDia, soloSagrado = false }) => {
  const toast = useToast();
  const conceptos = useMemo(() => (soloSagrado ? [SAGRADO] : [...TIPOS_SALIDA, SAGRADO]), [soloSagrado]);
  const nuevosTiempos = () => Object.fromEntries(conceptos.map(c => [c.valor, tiempoVacio()]));
  const fechaInicial = mes === mesActual() ? hoyLocal() : finDeMes(mes);
  const [fecha, setFecha] = useState(fechaInicial);
  const [tiempos, setTiempos] = useState(nuevosTiempos);
  const [revisitas, setRevisitas] = useState(0);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [visitasMapa, setVisitasMapa] = useState(null);

  // Visitas registradas en el mapa ese día (se pueden usar como revisitas con un toque)
  useEffect(() => {
    if (soloSagrado || !contarVisitasDelDia) return undefined;
    let vivo = true;
    contarVisitasDelDia(fecha).then(n => { if (vivo) setVisitasMapa(n); });
    return () => { vivo = false; };
  }, [fecha, soloSagrado, contarVisitasDelDia]);

  const totalPred = TIPOS_SALIDA.reduce((s, ts) => s + (tiempos[ts.valor] ? aHoras(tiempos[ts.valor]) : 0), 0);
  const totalSag = aHoras(tiempos.servicio_sagrado);
  const yaEseDia = registrosMes.filter(r => r.fecha === fecha).reduce((s, r) => s + (Number(r.horas) || 0), 0);

  const guardar = async (e) => {
    e.preventDefault();
    if (totalPred + totalSag <= 0) { toast.warning(soloSagrado ? t('Escribe cuánto tiempo') : t('Pon el tiempo en al menos un concepto')); return; }
    if (fecha < mes || fecha > finDeMes(mes)) { toast.warning(t('La fecha debe ser de {mes}', { mes: nombreMes(mes, getLocale()) })); return; }
    if (yaEseDia + totalPred + totalSag > 24) {
      toast.warning(t('Un día no puede pasar de 24 horas (ese día ya tienes {ya}).', { ya: formatHoras(yaEseDia) }));
      return;
    }
    if (revisitas > 0 && totalPred <= 0) { toast.warning(t('Las revisitas van con horas de predicación')); return; }
    // Las revisitas y la nota van en el concepto con más tiempo
    const conTiempo = conceptos.filter(c => aHoras(tiempos[c.valor]) > 0);
    const principal = [...conTiempo].sort((a, b) => aHoras(tiempos[b.valor]) - aHoras(tiempos[a.valor]))
      .find(c => c.valor !== 'servicio_sagrado')?.valor || conTiempo[0]?.valor;
    const lista = conTiempo.map(c => ({
      fecha,
      categoria: c.valor === 'servicio_sagrado' ? 'servicio_sagrado' : 'predicacion',
      tipo: c.valor === 'servicio_sagrado' ? null : c.valor,
      horas: Number(aHoras(tiempos[c.valor]).toFixed(2)),
      revisitas: c.valor === principal && c.valor !== 'servicio_sagrado' ? revisitas : 0,
      notas: c.valor === principal ? (notas.trim() || null) : null,
    }));
    setGuardando(true);
    try {
      await onAgregar(lista);
      toast.success(navigator.onLine
        ? t('Salida registrada: {total}', { total: formatHoras(totalPred + totalSag) })
        : t('Salida guardada sin conexión — se subirá al conectarse'));
      setTiempos(nuevosTiempos()); setRevisitas(0); setNotas('');
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const campo = (c) => (
    <CampoTiempo key={c.valor}
      etiqueta={soloSagrado ? t('Tiempo') : t(c.etiqueta)}
      icono={c.valor === 'servicio_sagrado' && !soloSagrado ? <Wrench size={14} style={{ color: '#D97706' }} /> : null}
      color={c.valor === 'servicio_sagrado' ? '#D97706' : '#2563EB'}
      valor={tiempos[c.valor]}
      onChange={v => setTiempos(prev => ({ ...prev, [c.valor]: v }))} />
  );

  return (
    <form className="card p-4 sm:p-5" onSubmit={guardar}>
      <h3 className="text-base font-bold text-primary flex items-center gap-2 mb-3">
        {soloSagrado ? <><Wrench size={18} style={{ color: '#D97706' }} /> {t('Servicio sagrado')}</> : <><Plus size={18} style={{ color: '#2563EB' }} /> {t('Registrar salida')}</>}
      </h3>

      <div className="form-group mb-3 sm:max-w-[240px]">
        <label className="form-label">{t('Fecha')}</label>
        <input type="date" value={fecha} min={mes} max={finDeMes(mes) < hoyLocal() ? finDeMes(mes) : hoyLocal()} onChange={e => setFecha(e.target.value)} required />
      </div>

      {!soloSagrado && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><ClipboardList size={13} /> {t('Predicación')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mb-3">
            {TIPOS_SALIDA.map(campo)}
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <Wrench size={13} /> {t('Aparte (no suma a las horas de predicación)')}
          </p>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {campo(SAGRADO)}
      </div>
      {soloSagrado && <p className="text-xs text-secondary mt-2 mb-0">{t('Aseo, mantenimiento y otras labores para Jehová. No suma a las horas de predicación.')}</p>}

      {!soloSagrado && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="form-label mb-0">{t('Revisitas')}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline px-3" onClick={() => setRevisitas(r => Math.max(0, r - 1))} aria-label="-">−</button>
              <span className="text-lg font-bold text-primary w-8 text-center">{revisitas}</span>
              <button type="button" className="btn btn-outline px-3" onClick={() => setRevisitas(r => r + 1)} aria-label="+">+</button>
            </div>
          </div>
          {visitasMapa > 0 && visitasMapa !== revisitas && (
            <button type="button" onClick={() => setRevisitas(visitasMapa)}
              className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-primary"
              style={{ background: 'rgba(8,145,178,0.12)', border: '1px solid rgba(8,145,178,0.35)' }}>
              <MapPin size={13} style={{ color: '#0891B2' }} />
              {t('Ese día registraste {n} visitas en el mapa · usar como revisitas', { n: visitasMapa })}
            </button>
          )}
        </div>
      )}

      <div className="form-group mt-3 mb-0">
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder={t('Notas (opcional)')} />
      </div>

      {/* Suma de todo lo que se va a guardar */}
      <div className="mt-3 p-3 rounded-xl flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary"
        style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.22)' }}>
        {!soloSagrado && <span>{t('Predicación')}: <strong className="text-primary">{formatHoras(totalPred)}</strong></span>}
        <span>{t('Servicio sagrado')}: <strong className="text-primary">{formatHoras(totalSag)}</strong></span>
        {!soloSagrado && <span className="sm:ml-auto font-bold text-primary">{t('Total del día')}: {formatHoras(totalPred + totalSag)}</span>}
      </div>

      <button type="submit" className="btn btn-primary w-full mt-4" disabled={guardando}>
        {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {t('Guardar salida')}
      </button>
    </form>
  );
};

const ListaSalidas = ({ registros, onEliminar }) => {
  const [borrar, setBorrar] = useState(null);
  // Agrupadas por día, con el total de cada día
  const dias = useMemo(() => {
    const m = new Map();
    for (const r of registros) { if (!m.has(r.fecha)) m.set(r.fecha, []); m.get(r.fecha).push(r); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [registros]);
  if (!registros.length) return null;
  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-base font-bold text-primary flex items-center gap-2 mb-3"><Clock size={18} style={{ color: '#2563EB' }} /> {t('Salidas del mes')} ({registros.length})</h3>
      <div className="flex flex-col gap-3">
        {dias.map(([dia, lista]) => (
        <div key={dia} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted px-1">
            <span>{fechaCorta(dia)}</span>
            <span>{formatHoras(lista.reduce((s, r) => s + (Number(r.horas) || 0), 0))}</span>
          </div>
        {lista.map(r => (
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
  // Ya enviado, pero después se agregaron o borraron salidas
  const distinto = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > 0.009;
  const cambiaron = !!informe && !informe._offline && (
    distinto(informe.horas_servicio_sagrado, totalesMes.servicioSagrado)
    || (precursor && (distinto(informe.horas, totalesMes.horas) || distinto(informe.revisitas, totalesMes.revisitas))));

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
        <div className="mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {dato(Clock, t('Horas de predicación'), formatHoras(totalesMes.horas), '#2563EB')}
            {dato(Repeat, t('Revisitas'), totalesMes.revisitas, '#0891B2')}
            {dato(Wrench, t('Servicio sagrado'), formatHoras(totalesMes.servicioSagrado), '#D97706')}
          </div>
          <Desglose totales={{ ...totalesMes, servicioSagrado: 0 }} />
        </div>
      ) : (
        <>
          <label className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer select-none mb-3"
            style={{ background: predico ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)', border: `1.5px solid ${predico ? '#10B981' : 'var(--border-color)'}` }}>
            <input type="checkbox" className="w-5 h-5 accent-emerald-500" style={{ minHeight: 0 }} checked={predico} onChange={e => setPredico(e.target.checked)} />
            <span className="text-base font-bold text-primary">{t('Prediqué este mes')}</span>
          </label>
          {totalesMes.servicioSagrado > 0 && (
            <div className="mb-3 sm:max-w-xs">{dato(Wrench, t('Servicio sagrado'), formatHoras(totalesMes.servicioSagrado), '#D97706')}</div>
          )}
        </>
      )}

      {cambiaron && (
        <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#D97706' }}>
          <AlertTriangle size={13} /> {t('Tus salidas cambiaron desde que enviaste: vuelve a enviar el informe.')}
        </p>
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
  const { disponible, perfil, registrosMes, totalesMes, totalesAnio, anio, informe, agregarRegistros, eliminarRegistro, guardarMetas, enviarInforme, contarVisitasDelDia } = useMiInforme(mes);

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
          {mes <= mesActual() && (
            <FormSalida key={mes} mes={mes} registrosMes={registrosMes} onAgregar={agregarRegistros} contarVisitasDelDia={contarVisitasDelDia} />
          )}
          <ListaSalidas registros={registrosMes} onEliminar={eliminar} />
        </>
      )}

      {/* Publicadores: igual que siempre (casilla + estudios) y además sus horas de servicio sagrado */}
      {!precursor && (
        <>
          {mes <= mesActual() && <FormSalida key={`sag-${mes}`} mes={mes} registrosMes={registrosMes} onAgregar={agregarRegistros} soloSagrado />}
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

// Reporte (Excel, PDF y reporte interactivo con el mismo modelo: utils/reportes). Documento en español.
const COLOR_ENVIO = { 'Enviado': '#059669', 'Sin enviar': '#D97706' };
const reporteCongregacion = (mes, filas, resumen, user) => {
  const nombre = nombreMes(mes, 'es-MX');
  const tot = TIPOS_PUBLICADOR.reduce((a, tp) => {
    const r = resumen[tp];
    a.total += r.total; a.enviados += r.enviados; a.predicaron += r.predicaron; a.horas += r.horas;
    a.estudios += r.estudios; a.revisitas += r.revisitas; a.sagrado += r.servicioSagrado;
    return a;
  }, { total: 0, enviados: 0, predicaron: 0, horas: 0, estudios: 0, revisitas: 0, sagrado: 0 });
  const porConcepto = TIPOS_SALIDA.map(ts => filas.reduce((suma, f) => suma + (esPrecursor(f.tipo) ? (f.porTipo?.[ts.valor] || 0) : 0), 0));
  const soloPrecursor = (f, v) => (esPrecursor(f.tipo) ? v : null);
  return {
    archivo: `Informes_${mes.slice(0, 7)}`,
    titulo: `Informe de servicio · ${nombre}`,
    subtitulo: user?.congregacion_nombre || 'Congregación',
    usuario: user?.nombre,
    color: '#2563EB',
    meta: [{ etiqueta: 'Mes', valor: nombre }],
    kpis: [
      { etiqueta: 'Enviaron su informe', valor: `${tot.enviados} de ${tot.total}`, detalle: `${tot.total - tot.enviados} sin enviar`, color: '#2563EB' },
      { etiqueta: 'Predicaron', valor: tot.predicaron, detalle: 'Publicadores y precursores', color: '#059669' },
      { etiqueta: 'Horas de precursores', valor: formatHoras(tot.horas), detalle: 'Auxiliares y regulares', color: '#7C3AED' },
      { etiqueta: 'Estudios bíblicos', valor: tot.estudios, color: '#0891B2' },
      { etiqueta: 'Revisitas', valor: tot.revisitas, detalle: 'De precursores', color: '#D97706' },
      { etiqueta: 'Servicio sagrado', valor: formatHoras(tot.sagrado), detalle: 'No suma a la predicación', color: '#64748B' },
    ],
    secciones: [
      {
        tipo: 'grafica', titulo: 'Informes enviados', en: ['pdf', 'html'],
        grafica: { tipo: 'dona', etiquetas: ['Enviados', 'Sin enviar'], series: [{ nombre: 'Miembros', valores: [tot.enviados, tot.total - tot.enviados] }], colores: ['#059669', '#F59E0B'], unidad: 'miembros' },
      },
      porConcepto.some(v => v > 0) && {
        tipo: 'grafica', titulo: 'Horas de precursores por concepto', en: ['pdf', 'html'],
        grafica: { tipo: 'barrasH', etiquetas: TIPOS_SALIDA.map(ts => ts.etiqueta), series: [{ nombre: 'Horas', valores: porConcepto.map(v => Number(v.toFixed(2))), color: '#7C3AED' }] },
      },
      {
        tipo: 'tabla', titulo: 'Resumen por tipo de publicador', hoja: 'Resumen por tipo',
        columnas: [
          { titulo: 'Tipo', clave: 'tipo', colores: COLOR_TIPO },
          { titulo: 'Miembros', clave: 'total', tipo: 'numero' },
          { titulo: 'Enviaron', clave: 'enviados', tipo: 'numero' },
          { titulo: 'Predicaron', clave: 'predicaron', tipo: 'numero' },
          { titulo: 'Horas', clave: 'horas', tipo: 'horas' },
          { titulo: 'Estudios', clave: 'estudios', tipo: 'numero' },
          { titulo: 'Revisitas', clave: 'revisitas', tipo: 'numero' },
          { titulo: 'Servicio sagrado', clave: 'servicioSagrado', tipo: 'horas' },
        ],
        filas: TIPOS_PUBLICADOR.map(tp => ({ tipo: tp, ...resumen[tp] })),
        totales: { total: 'suma', enviados: 'suma', predicaron: 'suma', horas: 'suma', estudios: 'suma', revisitas: 'suma', servicioSagrado: 'suma' },
      },
      {
        tipo: 'tabla', titulo: 'Detalle por persona', hoja: 'Detalle',
        columnas: [
          { titulo: 'Nombre', clave: 'nombre' },
          { titulo: 'Tipo', clave: 'tipo', colores: COLOR_TIPO },
          { titulo: 'Informe', clave: 'envio', colores: COLOR_ENVIO },
          { titulo: 'Predicó', clave: 'predico', tipo: 'siNo' },
          { titulo: 'Horas', clave: 'horas', tipo: 'horas' },
          ...TIPOS_SALIDA.map(ts => ({ titulo: ts.etiqueta, clave: `c_${ts.valor}`, tipo: 'horas', en: ['excel', 'html'] })),
          { titulo: 'Estudios', clave: 'estudios', tipo: 'numero' },
          { titulo: 'Revisitas', clave: 'revisitas', tipo: 'numero' },
          { titulo: 'Servicio sagrado', clave: 'servicioSagrado', tipo: 'horas' },
          { titulo: 'Comentarios', clave: 'comentarios', ancho: 40, en: ['excel', 'html'] },
        ],
        filas: filas.map(f => ({
          ...f,
          envio: f.enviado ? 'Enviado' : 'Sin enviar',
          horas: soloPrecursor(f, f.horas),
          revisitas: soloPrecursor(f, f.revisitas),
          ...Object.fromEntries(TIPOS_SALIDA.map(ts => [`c_${ts.valor}`, soloPrecursor(f, f.porTipo?.[ts.valor] || 0)])),
        })),
        totales: { horas: 'suma', estudios: 'suma', revisitas: 'suma', servicioSagrado: 'suma', ...Object.fromEntries(TIPOS_SALIDA.map(ts => [`c_${ts.valor}`, 'suma'])) },
      },
    ].filter(Boolean),
  };
};

const InformeCongregacion = ({ mes, setMes }) => {
  const { user } = useAuth();
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
        <BotonesExportar armar={() => reporteCongregacion(mes, filas, resumen, user)} disabled={!filas.length} />
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
                    <td className="px-4 py-3 text-right text-primary">{formatHoras(f.servicioSagrado)}</td>
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
                  {f.servicioSagrado > 0 && <span>· {t('Servicio sagrado')} {formatHoras(f.servicioSagrado)}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ── Actividad (quién predica, quién no, inactivos) ─────────────────────────────────

const ESTADOS_ACTIVIDAD = {
  inactivo: { etiqueta: 'Inactivo', color: '#EF4444', Icono: UserX },
  sin_predicar: { etiqueta: 'Sin predicar', color: '#F59E0B', Icono: Hourglass },
  activo: { etiqueta: 'Activo', color: '#10B981', Icono: UserCheck },
};
const FUENTE_ACTIVIDAD = { informe: 'Informe', horas: 'Horas anotadas', visitas: 'Visita en el mapa' };
const ROLES_AJUSTAN_INACTIVIDAD = ['Super Admin', 'Admin Principal', 'Anciano'];

const textoUltima = (f) => {
  if (f.dias == null) return f.nuevo ? t('Nuevo · aún sin actividad') : t('Sin actividad registrada');
  if (f.dias === 0) return t('Hoy');
  if (f.dias === 1) return t('Ayer');
  if (f.dias < 60) return t('Hace {n} días', { n: f.dias });
  return t('Hace {n} meses', { n: Math.floor(f.dias / 30) });
};
const textoMesesSin = (f) => {
  if (f.estado === 'activo') return t('Al día');
  if (f.mesesSin == null) return f.nuevo ? '—' : t('{n}+ meses', { n: 12 });
  return f.mesesSin === 1 ? t('1 mes') : t('{n} meses', { n: f.mesesSin });
};
const textoEsteMes = (f) => {
  const partes = [];
  if (f.horasMes > 0) partes.push(formatHoras(f.horasMes));
  if (f.visitasMes > 0) partes.push(f.visitasMes === 1 ? t('1 visita') : t('{n} visitas', { n: f.visitasMes }));
  return partes.join(' · ') || '—';
};

const BadgeActividad = ({ estado }) => {
  const cfg = ESTADOS_ACTIVIDAD[estado];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${cfg.color}1F`, color: cfg.color }}>
      <cfg.Icono size={12} /> {t(cfg.etiqueta)}
    </span>
  );
};

const reporteActividad = (todas, visibles, umbral, user) => {
  const n = (e) => todas.filter(f => f.estado === e).length;
  const colorEstado = Object.fromEntries(Object.values(ESTADOS_ACTIVIDAD).map(c => [c.etiqueta, c.color]));
  const filtrado = visibles.length !== todas.length;
  return {
    archivo: `Actividad_${hoyLocal()}`,
    titulo: 'Actividad de la congregación',
    subtitulo: user?.congregacion_nombre || 'Congregación',
    usuario: user?.nombre,
    color: '#059669',
    meta: [{ etiqueta: 'Inactivo', valor: `${umbral} meses o más sin actividad` }],
    kpis: [
      { etiqueta: 'Activos', valor: n('activo'), detalle: 'Predicaron este mes o el anterior', color: '#059669' },
      { etiqueta: 'Sin predicar', valor: n('sin_predicar'), detalle: `Menos de ${umbral} meses sin actividad`, color: '#D97706' },
      { etiqueta: 'Inactivos', valor: n('inactivo'), detalle: `${umbral}+ meses sin actividad`, color: '#DC2626' },
      { etiqueta: 'Miembros', valor: todas.length, color: '#2563EB' },
    ],
    secciones: [
      {
        tipo: 'texto', titulo: 'Cómo se cuenta',
        parrafos: [
          'Cuenta como actividad el informe del mes con "Prediqué", las horas de predicación anotadas y las visitas registradas en el mapa. El servicio sagrado no cuenta como predicación.',
          `Activo = tuvo actividad este mes o el anterior (los publicadores informan al terminar el mes). Inactivo = ${umbral} meses completos o más sin actividad.`,
        ],
      },
      {
        tipo: 'grafica', titulo: 'Estado de la congregación', en: ['pdf', 'html'],
        grafica: { tipo: 'dona', etiquetas: ['Activos', 'Sin predicar', 'Inactivos'], series: [{ nombre: 'Miembros', valores: [n('activo'), n('sin_predicar'), n('inactivo')] }], colores: ['#10B981', '#F59E0B', '#EF4444'], unidad: 'miembros' },
      },
      {
        tipo: 'tabla', titulo: 'Detalle por persona', hoja: 'Actividad',
        descripcion: filtrado ? `Lista filtrada: ${visibles.length} de ${todas.length} miembros.` : undefined,
        columnas: [
          { titulo: 'Nombre', clave: 'nombre' },
          { titulo: 'Tipo', clave: 'tipo', colores: COLOR_TIPO },
          { titulo: 'Estado', clave: 'estadoTexto', colores: colorEstado },
          { titulo: 'Última actividad', clave: 'ultima', tipo: 'fecha' },
          { titulo: 'Cómo', clave: 'fuenteTexto' },
          { titulo: 'Días sin actividad', clave: 'dias', tipo: 'numero' },
          { titulo: 'Meses sin actividad', clave: 'meses', tipo: 'numero' },
          { titulo: 'Horas este mes', clave: 'horasMes', tipo: 'horas' },
          { titulo: 'Visitas este mes', clave: 'visitasMes', tipo: 'numero' },
        ],
        filas: visibles.map(f => ({
          ...f,
          estadoTexto: ESTADOS_ACTIVIDAD[f.estado].etiqueta,
          fuenteTexto: f.fuente ? FUENTE_ACTIVIDAD[f.fuente] : (f.nuevo ? 'Nuevo' : 'Sin registro'),
          meses: f.estado === 'activo' ? 0 : f.mesesSin,
        })),
      },
    ],
  };
};

const ActividadCongregacion = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { cargando, filas, conteo, umbral, umbralEnBD, guardarUmbral } = useActividadCongregacion();
  const [filtro, setFiltro] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const puedeAjustar = ROLES_AJUSTAN_INACTIVIDAD.includes(user?.rol);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter(f => (filtro === 'todos' || f.estado === filtro) && (!q || String(f.nombre || '').toLowerCase().includes(q)));
  }, [filas, filtro, buscar]);

  const cambiarUmbral = async (n) => {
    try {
      const donde = await guardarUmbral(n);
      if (donde === 'bd') toast.success(t('Inactivo después de {n} meses (para toda la congregación)', { n }));
      else if (user?.congregacion_id) toast.warning(t('Guardado solo en este dispositivo: falta correr la Migración 9 (MIGRACION_9_ACTIVIDAD.sql).'));
      else toast.success(t('Guardado en este dispositivo'));
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Conteo (también son filtros) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {['activo', 'sin_predicar', 'inactivo'].map(e => {
          const cfg = ESTADOS_ACTIVIDAD[e];
          const activo = filtro === e;
          return (
            <button key={e} type="button" onClick={() => setFiltro(activo ? 'todos' : e)}
              className="card p-3 sm:p-4 text-left transition-transform active:scale-[0.98] min-w-0"
              style={{ borderTop: `3px solid ${cfg.color}`, outline: activo ? `2px solid ${cfg.color}` : 'none', outlineOffset: 0 }}>
              <span className="flex items-start gap-1.5 text-[11px] sm:text-xs font-bold leading-tight" style={{ color: cfg.color }}>
                <cfg.Icono size={14} className="shrink-0" /> {t(cfg.etiqueta)}
              </span>
              <span className="block text-2xl sm:text-3xl font-extrabold text-primary mt-1 leading-none">{cargando ? '…' : conteo[e]}</span>
            </button>
          );
        })}
      </div>

      {/* Regla de inactividad (ajustable) */}
      <div className="card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap text-sm text-primary">
          <Activity size={16} style={{ color: '#2563EB' }} className="shrink-0" />
          <span className="font-semibold">{t('Inactivo después de')}</span>
          {puedeAjustar ? (
            <select value={umbral} onChange={e => cambiarUmbral(Number(e.target.value))} className="w-auto py-1 px-2 font-bold" aria-label={t('Meses sin actividad')}>
              {MESES_INACTIVIDAD_OPCIONES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : <strong>{umbral}</strong>}
          <span className="font-semibold">{t('meses sin actividad')}</span>
          {puedeAjustar && user?.congregacion_id && !umbralEnBD && (
            <span className="text-[11px] font-semibold" style={{ color: '#D97706' }}>{t('(solo en este dispositivo)')}</span>
          )}
        </div>
        <p className="text-xs text-secondary m-0">
          {t('Cuenta como actividad: el informe con "Prediqué", las horas de predicación y las visitas registradas en el mapa. Activo = predicó este mes o el anterior (los publicadores informan al terminar el mes).')}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {[['todos', `${t('Todos')} (${filas.length})`], ...['inactivo', 'sin_predicar', 'activo'].map(e => [e, t(ESTADOS_ACTIVIDAD[e].etiqueta)])].map(([v, etq]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold border"
              style={filtro === v ? { background: '#2563EB', borderColor: '#2563EB', color: '#fff' } : { background: 'var(--bg-hover)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              {etq}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <div className="relative flex-1 sm:w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={t('Buscar nombre')} className="pl-9 w-full" />
          </div>
          <BotonesExportar armar={() => reporteActividad(filas, visibles, umbral, user)} disabled={!visibles.length} className="shrink-0" />
        </div>
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
                  <th className="px-3 py-3">{t('Última actividad')}</th><th className="px-3 py-3">{t('Sin actividad')}</th>
                  <th className="px-4 py-3 text-right">{t('Este mes')}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(f => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td className="px-4 py-3 font-semibold text-primary">{f.nombre}</td>
                    <td className="px-3 py-3"><BadgeTipo tipo={f.tipo} /></td>
                    <td className="px-3 py-3"><BadgeActividad estado={f.estado} /></td>
                    <td className="px-3 py-3">
                      <span className="text-primary">{textoUltima(f)}</span>
                      {f.ultima && <span className="block text-[11px] text-muted">{fechaCorta(f.ultima)} · {t(FUENTE_ACTIVIDAD[f.fuente])}</span>}
                    </td>
                    <td className="px-3 py-3 font-semibold" style={{ color: ESTADOS_ACTIVIDAD[f.estado].color }}>{textoMesesSin(f)}</td>
                    <td className="px-4 py-3 text-right text-primary">{textoEsteMes(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <div className="flex flex-col gap-2 md:hidden">
            {visibles.map(f => (
              <div key={f.id} className="card p-3.5" style={{ borderLeft: `4px solid ${ESTADOS_ACTIVIDAD[f.estado].color}` }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-bold text-primary truncate">{f.nombre}</span>
                  <BadgeActividad estado={f.estado} />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-secondary">
                  <BadgeTipo tipo={f.tipo} />
                  <span>{textoUltima(f)}</span>
                  {f.estado !== 'activo' && f.mesesSin != null && <span>· {t('Sin actividad')}: <strong style={{ color: ESTADOS_ACTIVIDAD[f.estado].color }}>{textoMesesSin(f)}</strong></span>}
                  {(f.horasMes > 0 || f.visitasMes > 0) && <span>· {t('Este mes')}: {textoEsteMes(f)}</span>}
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
        <div className="flex gap-1 p-1 rounded-xl mb-5 max-w-lg" style={{ background: 'var(--bg-hover)' }}>
          {[['mio', t('Mi informe')], ['congregacion', t('Congregación')], ['actividad', t('Actividad')]].map(([v, etq]) => (
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
        : pestana === 'actividad' && puedeVerCongregacion
          ? <ActividadCongregacion />
          : <MiInforme mes={mes} setMes={setMes} />}
      <div className="h-6" />
    </div>
  );
};

export default Informes;
