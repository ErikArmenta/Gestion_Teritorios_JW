import { useMemo, useState } from 'react';
import { Sparkles, CalendarClock, ArrowUp, ArrowDown, X, Bell, BellOff, Eye, AlertTriangle, Pencil } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { TarjetaAseo } from './AvisoAseo';
import { useToast } from './Toast';
import { useAseo } from '../hooks/useAseo';
import { calendarioAseo, lunesDe, masDias, hora12, limpiarReuniones } from '../utils/aseo';
import { t, getLocale } from '../i18n';

// Aseo del Salón del Reino (Migración 17): planeación por congregación, un grupo por semana, recurrente.
// Ven todos los que entran a Grupos; planean Super Admin, Admin Principal, Anciano y Ministerial.

const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmt = (s, op) => new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', ...op }).format(new Date(`${s}T12:00:00Z`));
// 2024-01-07 fue domingo: sirve para el nombre de cada día (0 = domingo)
const nombreDia = (dia, largo = true) => fmt(masDias('2024-01-07', dia), { weekday: largo ? 'long' : 'short' });
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Elegir días y hora de las reuniones
function EditorReuniones({ valor, onChange }) {
  const porDia = new Map(valor.map(r => [r.dia, r.hora]));
  const alternar = (dia) => onChange(porDia.has(dia) ? valor.filter(r => r.dia !== dia) : limpiarReuniones([...valor, { dia, hora: dia === 0 || dia === 6 ? '10:00' : '19:30' }]));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {ORDEN_DIAS.map(d => (
          <button key={d} type="button" onClick={() => alternar(d)} aria-pressed={porDia.has(d)}
            className="px-3 py-1.5 rounded-full text-sm font-semibold"
            style={porDia.has(d) ? { background: '#2563EB', color: '#fff' } : { background: '#F1F5F9', color: '#475569' }}>
            {mayus(nombreDia(d, false))}
          </button>
        ))}
      </div>
      {valor.length > 0 && (
        <div className="grid gap-2 mt-3">
          {valor.map(r => (
            <label key={r.dia} className="flex items-center gap-3">
              <span className="w-28 text-sm font-semibold" style={{ color: '#0F172A' }}>{mayus(nombreDia(r.dia))}</span>
              <input type="time" value={r.hora} required style={{ maxWidth: 160 }}
                onChange={e => onChange(valor.map(x => x.dia === r.dia ? { ...x, hora: e.target.value } : x))}
                aria-label={t('Hora de la reunión del {dia}', { dia: nombreDia(r.dia) })} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AseoSalon({ congregacionId, grupos, puedeGestionar }) {
  const toast = useToast();
  const { disponible, plan, cambios, guardarPlan, guardarCambio, quitarCambio } = useAseo(congregacionId);
  const [editar, setEditar] = useState(null);   // borrador de la planeación
  const [cambio, setCambio] = useState(null);   // borrador del cambio de una semana
  const [vista, setVista] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const hoy = hoyLocal();
  const semanas = useMemo(() => (plan ? calendarioAseo(plan, cambios, grupos, hoy, 8) : []), [plan, cambios, grupos, hoy]);
  const grupoDe = (id) => grupos.find(g => String(g.id) === String(id)) || null;
  const reuniones = limpiarReuniones(plan?.reuniones);

  const abrirPlan = () => {
    const orden = (plan?.orden_grupos || []).map(String).filter(id => grupos.some(g => String(g.id) === id));
    const resto = grupos.map(g => String(g.id)).filter(id => !orden.includes(id));
    setEditar({
      reuniones: reuniones.length ? reuniones : [{ dia: 4, hora: '19:30' }, { dia: 0, hora: '10:00' }],
      orden: plan ? orden : [...orden, ...resto],
      fuera: plan ? resto : [],
      inicio: plan?.inicio ? String(plan.inicio).slice(0, 10) : lunesDe(hoy),
      avisos: plan ? plan.avisos !== false : true,
    });
  };

  const mover = (i, d) => setEditar(e => {
    const orden = [...e.orden];
    const j = i + d;
    if (j < 0 || j >= orden.length) return e;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    return { ...e, orden };
  });

  const guardar = async () => {
    if (!editar.reuniones.length) { toast.warning(t('Elige al menos un día de reunión')); return; }
    if (editar.reuniones.some(r => !r.hora)) { toast.warning(t('Pon la hora de cada reunión')); return; }
    if (!editar.orden.length) { toast.warning(t('Incluye al menos un grupo en la rotación')); return; }
    setGuardando(true);
    try {
      await guardarPlan({ reuniones: editar.reuniones, orden_grupos: editar.orden, inicio: editar.inicio, avisos: editar.avisos });
      toast.success(t('Planeación del aseo guardada'));
      setEditar(null);
    } catch (err) {
      toast.error(`${t('Error')}: ${t(err.message)}`);
    } finally { setGuardando(false); }
  };

  const abrirCambio = (s) => setCambio({
    semana: s.lunes,
    existe: !!s.cambio,
    grupo_id: s.cambio ? (s.cambio.grupo_id ? String(s.cambio.grupo_id) : '') : (s.grupo_id || ''),
    sin_aseo: !!s.cambio?.sin_aseo,
    otrosDias: !!s.cambio?.reuniones?.length,
    reuniones: s.cambio?.reuniones?.length ? limpiarReuniones(s.cambio.reuniones) : reuniones,
    nota: s.cambio?.nota || '',
  });

  const guardarSemana = async () => {
    if (!cambio.sin_aseo && !cambio.grupo_id) { toast.warning(t('Elige el grupo de esa semana')); return; }
    if (cambio.otrosDias && (!cambio.reuniones.length || cambio.reuniones.some(r => !r.hora))) { toast.warning(t('Pon la hora de cada reunión')); return; }
    setGuardando(true);
    try {
      await guardarCambio({ ...cambio, reuniones: cambio.otrosDias ? cambio.reuniones : null });
      toast.success(t('Cambio guardado para esa semana'));
      setCambio(null);
    } catch (err) {
      toast.error(`${t('Error')}: ${t(err.message)}`);
    } finally { setGuardando(false); }
  };

  const borrarCambio = async () => {
    setGuardando(true);
    try { await quitarCambio(cambio.semana); toast.success(t('Esa semana vuelve a la rotación normal')); setCambio(null); }
    catch (err) { toast.error(`${t('Error')}: ${err.message}`); }
    finally { setGuardando(false); }
  };

  if (!congregacionId || disponible === null) return null;

  const encabezado = (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', color: '#fff' }}>
          <Sparkles size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-primary m-0">{t('Aseo del Salón del Reino')}</h2>
          <p className="text-xs text-secondary m-0">{t('Un grupo por semana. El sistema les avisa un día antes (7 p. m.) y el mismo día (8 a. m.).')}</p>
        </div>
      </div>
      {disponible && (
        <div className="flex flex-wrap gap-2">
          {plan && (
            <button className="btn btn-outline" onClick={() => setVista(true)}>
              <Eye size={15} /> {t('Así les llegará')}
            </button>
          )}
          {puedeGestionar && grupos.length > 0 && (
            <button className="btn btn-primary" onClick={abrirPlan}>
              <CalendarClock size={15} /> {plan ? t('Editar planeación') : t('Planear aseo')}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (disponible === false) {
    return (
      <div className="card mb-6" data-aseo>
        {encabezado}
        <div className="flex gap-2 text-sm text-secondary">
          <AlertTriangle size={18} className="shrink-0" style={{ color: '#F59E0B' }} />
          <span>{t('Para planear el aseo hay que ejecutar la Migración 17 (MIGRACION_17_ASEO.sql) en Supabase → SQL Editor.')}</span>
        </div>
      </div>
    );
  }

  const ejemplo = semanas.find(s => s.grupo_id) || null;
  const grupoEjemplo = grupoDe(ejemplo?.grupo_id) || grupos[0];

  return (
    <div className="card mb-6" data-aseo>
      {encabezado}

      {!plan ? (
        <p className="text-sm text-secondary m-0">
          {grupos.length ? t('Aún no hay planeación del aseo para esta congregación.') : t('Primero crea los grupos de la congregación.')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {reuniones.map(r => (
              <span key={r.dia} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                {mayus(nombreDia(r.dia))} · {hora12(r.hora)}
              </span>
            ))}
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
              style={plan.avisos !== false ? { background: 'rgba(16,185,129,0.12)', color: '#059669' } : { background: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)' }}>
              {plan.avisos !== false ? <Bell size={12} /> : <BellOff size={12} />}
              {plan.avisos !== false ? t('Avisos activos') : t('Avisos apagados')}
            </span>
          </div>

          <div className="grid gap-1.5">
            {semanas.map((s, i) => {
              const g = grupoDe(s.grupo_id);
              return (
                <div key={s.lunes} data-semana={s.lunes} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: i === 0 ? 'rgba(59,130,246,0.08)' : 'var(--bg-hover)', border: i === 0 ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent' }}>
                  <div className="w-28 sm:w-32 shrink-0">
                    <p className="text-xs font-bold m-0" style={{ color: i === 0 ? '#2563EB' : 'var(--text-muted)' }}>
                      {i === 0 ? t('Esta semana') : i === 1 ? t('Próxima semana') : t('Semana del {fecha}', { fecha: fmt(s.lunes, { day: 'numeric', month: 'short' }) })}
                    </p>
                    <p className="text-[11px] text-muted m-0 truncate">
                      {s.reuniones.map(r => fmt(r.fecha, { weekday: 'short', day: 'numeric' })).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {s.grupo_id && g ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color || '#3B82F6' }} />
                        <span className="text-sm font-semibold text-primary truncate">{g.nombre}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted italic">{t('Sin aseo')}</span>
                    )}
                    {s.cambio && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }} title={s.cambio.nota || ''}>
                        {t('Cambio')}
                      </span>
                    )}
                  </div>
                  {s.cambio?.nota && <span className="hidden md:inline text-xs text-muted truncate max-w-[200px]">{s.cambio.nota}</span>}
                  {puedeGestionar && (
                    <button className="p-2 rounded-lg shrink-0" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
                      onClick={() => abrirCambio(s)} aria-label={t('Cambiar esta semana')} title={t('Cambiar esta semana')}>
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Planeación */}
      {editar && (
        <ModalOverlay onClose={() => setEditar(null)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold m-0" style={{ color: '#0F172A' }}>{t('Planeación del aseo')}</h2>
            <button onClick={() => setEditar(null)} aria-label={t('Cerrar')} style={{ color: '#64748B' }}><X size={18} /></button>
          </div>
          <div className="form-group">
            <label className="form-label">{t('Días y hora de las reuniones')}</label>
            <EditorReuniones valor={editar.reuniones} onChange={(r) => setEditar(e => ({ ...e, reuniones: r }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('Orden de la rotación (un grupo por semana)')}</label>
            <div className="grid gap-1.5">
              {editar.orden.map((id, i) => {
                const g = grupoDe(id);
                return (
                  <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <span className="w-6 text-center text-xs font-bold" style={{ color: '#64748B' }}>{i + 1}</span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g?.color || '#3B82F6' }} />
                    <span className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{g?.nombre}</span>
                    <button type="button" className="p-1.5 rounded" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={t('Subir')} style={{ color: '#475569', opacity: i === 0 ? 0.3 : 1 }}><ArrowUp size={15} /></button>
                    <button type="button" className="p-1.5 rounded" onClick={() => mover(i, 1)} disabled={i === editar.orden.length - 1} aria-label={t('Bajar')} style={{ color: '#475569', opacity: i === editar.orden.length - 1 ? 0.3 : 1 }}><ArrowDown size={15} /></button>
                    <button type="button" className="p-1.5 rounded" onClick={() => setEditar(e => ({ ...e, orden: e.orden.filter(x => x !== id), fuera: [...e.fuera, id] }))} aria-label={t('Quitar de la rotación')} style={{ color: '#DC2626' }}><X size={15} /></button>
                  </div>
                );
              })}
            </div>
            {editar.fuera.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs" style={{ color: '#64748B' }}>{t('Fuera de la rotación:')}</span>
                {editar.fuera.map(id => (
                  <button key={id} type="button" className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F1F5F9', color: '#334155' }}
                    onClick={() => setEditar(e => ({ ...e, fuera: e.fuera.filter(x => x !== id), orden: [...e.orden, id] }))}>
                    + {grupoDe(id)?.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">{t('¿Desde qué semana empieza el primer grupo?')}</label>
            <input type="date" value={editar.inicio} onChange={e => e.target.value && setEditar(x => ({ ...x, inicio: e.target.value }))} />
            {editar.orden[0] && (
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                {t('A {grupo} le toca la semana del {fecha}; luego sigue el orden y se repite solo.', {
                  grupo: grupoDe(editar.orden[0])?.nombre || '', fecha: fmt(lunesDe(editar.inicio), { day: 'numeric', month: 'long' }),
                })}
              </p>
            )}
          </div>
          <label className="flex items-start gap-3 mt-1 cursor-pointer">
            <input type="checkbox" checked={editar.avisos} onChange={e => setEditar(x => ({ ...x, avisos: e.target.checked }))} style={{ width: 20, height: 20, marginTop: 2 }} />
            <span className="text-sm" style={{ color: '#334155' }}>{t('Avisar a los hermanos del grupo (un día antes a las 7 p. m. y el mismo día a las 8 a. m.)')}</span>
          </label>
          <div className="flex gap-3 mt-5">
            <button className="btn btn-outline flex-1" onClick={() => setEditar(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary flex-1" onClick={guardar} disabled={guardando}>{guardando ? t('Guardando...') : t('Guardar')}</button>
          </div>
        </ModalOverlay>
      )}

      {/* Cambio de una semana */}
      {cambio && (
        <ModalOverlay onClose={() => setCambio(null)} size="small">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold m-0" style={{ color: '#0F172A' }}>{t('Semana del {fecha}', { fecha: fmt(cambio.semana, { day: 'numeric', month: 'long' }) })}</h2>
            <button onClick={() => setCambio(null)} aria-label={t('Cerrar')} style={{ color: '#64748B' }}><X size={18} /></button>
          </div>
          <div className="form-group">
            <label className="form-label">{t('¿Quién hace el aseo esta semana?')}</label>
            <select value={cambio.sin_aseo ? 'sin' : cambio.grupo_id} onChange={e => setCambio(c => ({ ...c, sin_aseo: e.target.value === 'sin', grupo_id: e.target.value === 'sin' ? '' : e.target.value }))}>
              <option value="">{t('Elige un grupo...')}</option>
              {grupos.map(g => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
              <option value="sin">{t('Sin aseo esta semana (asamblea, visita, etc.)')}</option>
            </select>
          </div>
          {!cambio.sin_aseo && (
            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: '#334155' }}>
                <input type="checkbox" checked={cambio.otrosDias} onChange={e => setCambio(c => ({ ...c, otrosDias: e.target.checked }))} style={{ width: 18, height: 18 }} />
                {t('Esta semana las reuniones son otros días u otra hora')}
              </label>
              {cambio.otrosDias && (
                <div className="mt-3"><EditorReuniones valor={cambio.reuniones} onChange={(r) => setCambio(c => ({ ...c, reuniones: r }))} /></div>
              )}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('Nota (opcional)')}</label>
            <input value={cambio.nota} maxLength={200} onChange={e => setCambio(c => ({ ...c, nota: e.target.value }))} placeholder={t('Ej. Visita del superintendente de circuito')} />
          </div>
          <p className="text-xs" style={{ color: '#64748B' }}>{t('Solo cambia esta semana; la rotación sigue igual las demás.')}</p>
          <div className="flex flex-wrap gap-3 mt-4">
            {cambio.existe && (
              <button className="btn btn-outline flex-1" onClick={borrarCambio} disabled={guardando} style={{ color: '#DC2626' }}>{t('Quitar cambio')}</button>
            )}
            <button className="btn btn-outline flex-1" onClick={() => setCambio(null)}>{t('Cancelar')}</button>
            <button className="btn btn-primary flex-1" onClick={guardarSemana} disabled={guardando}>{guardando ? t('Guardando...') : t('Guardar')}</button>
          </div>
        </ModalOverlay>
      )}

      {/* Vista previa del aviso */}
      {vista && grupoEjemplo && (
        <ModalOverlay onClose={() => setVista(false)} size="small">
          <div className="-m-4 sm:-m-7">
            <TarjetaAseo grupo={grupoEjemplo.nombre} color={grupoEjemplo.color || '#2563EB'}
              fecha={ejemplo?.reuniones[0]?.fecha} hora={ejemplo?.reuniones[0]?.hora} cuando="manana"
              onListo={() => setVista(false)} onCerrar={() => setVista(false)} />
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
