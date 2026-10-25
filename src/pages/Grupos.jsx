import { useEffect, useMemo, useState } from 'react';
import { UsersRound, Plus, Pencil, Trash2, Search, Map as MapIcon, CheckCircle2, AlertTriangle, X, Crown } from 'lucide-react';
import { useGrupos } from '../context/GruposContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useToast } from '../components/Toast';
import ModalOverlay from '../components/ModalOverlay';
import ConfirmModal from '../components/ConfirmModal';
import { formatFechaCorta } from '../utils/territoryProgress';
// "t" se usa para territorios/trabajos en los filtros, por eso la función de traducción es tx
import { t as tx } from '../i18n';

const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const nombreTerritorio = (t) => [t?.numero, t?.nombre].filter(Boolean).join(' · ') || tx('Territorio');

const Grupos = () => {
  const {
    disponible, grupos: todosGrupos, trabajos, miembros: todosMiembros, puedeGestionar,
    crearGrupo, actualizarGrupo, eliminarGrupo, asignarMiembro,
  } = useGrupos();
  const { territorios } = useData();
  const { user } = useAuth();
  const toast = useToast();

  // Los grupos son por congregación y no se mezclan: la página siempre trabaja sobre UNA.
  // Usuarios con congregación → la suya. Super Admin global → elige cuál.
  const congFija = user?.congregacion_id || null;
  const [congSel, setCongSel] = useState(congFija || '');
  const [congregaciones, setCongregaciones] = useState([]);
  useEffect(() => {
    if (congFija) return;
    supabase.from('congregaciones').select('id, nombre').order('nombre')
      .then(({ data }) => setCongregaciones(data || []));
  }, [congFija]);

  const grupos = useMemo(
    () => todosGrupos.filter(g => String(g.congregacion_id) === String(congSel)),
    [todosGrupos, congSel]
  );
  const miembros = useMemo(
    () => todosMiembros.filter(m => String(m.congregacion_id) === String(congSel)),
    [todosMiembros, congSel]
  );

  const [form, setForm] = useState(null); // null | { id?, nombre, color, encargado_id }
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const anioActual = String(new Date().getFullYear());

  const resumen = useMemo(() => grupos.map(g => {
    const delGrupo = trabajos.filter(t => String(t.grupo_id) === String(g.id));
    return {
      grupo: g,
      miembros: miembros.filter(m => String(m.grupo_id) === String(g.id)),
      encargado: miembros.find(m => String(m.id) === String(g.encargado_id)) || null,
      enProgreso: delGrupo.filter(t => t.estado === 'en_progreso'),
      completadosAnio: delGrupo.filter(t => t.estado === 'completado' && String(t.fecha_fin || '').startsWith(anioActual)).length,
    };
  }), [grupos, trabajos, miembros, anioActual]);

  const miembrosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return miembros
      .filter(m => m.activo !== false)
      .filter(m => !q || m.nombre?.toLowerCase().includes(q));
  }, [miembros, busqueda]);

  const sinGrupo = miembros.filter(m => m.activo !== false && !m.grupo_id).length;

  const guardar = async () => {
    if (!form?.nombre?.trim()) { toast.warning(tx('Escribe el nombre del grupo')); return; }
    setGuardando(true);
    try {
      const datos = { nombre: form.nombre.trim(), color: form.color, encargado_id: form.encargado_id ? Number(form.encargado_id) : null };
      let grupoId = form.id;
      if (grupoId) await actualizarGrupo(grupoId, datos);
      else grupoId = (await crearGrupo({ ...datos, congregacion_id: congSel }))?.id;
      // El encargado pertenece a su propio grupo
      if (datos.encargado_id && grupoId) await asignarMiembro(datos.encargado_id, grupoId);
      toast.success(form.id ? tx('Grupo actualizado') : tx('Grupo creado'));
      setForm(null);
    } catch (err) {
      toast.error(`${tx('Error')}: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarGrupo = async (usuario, grupoId) => {
    try {
      await asignarMiembro(usuario.id, grupoId ? Number(grupoId) : null);
      toast.success(grupoId ? tx('{nombre} asignado al grupo', { nombre: usuario.nombre }) : tx('{nombre} quitado del grupo', { nombre: usuario.nombre }));
    } catch (err) {
      toast.error(`${tx('Error')}: ${err.message}`);
    }
  };

  if (disponible === false) {
    return (
      <div className="animate-page-in max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0 mb-4">{tx('Grupos de predicación')}</h1>
        <div className="card flex gap-3" style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
          <AlertTriangle size={22} className="shrink-0" style={{ color: '#F59E0B' }} />
          <div>
            <p className="font-bold text-primary mb-1">{tx('Falta preparar la base de datos')}</p>
            <p className="text-sm text-secondary">
              {tx('Para usar grupos de predicación hay que ejecutar la Migración 5 del archivo SQL_MIGRATIONS.md en Supabase → SQL Editor. Después recarga esta página.')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">{tx('Grupos de predicación')}</h1>
          <p className="text-sm mt-0.5 text-secondary">{tx('Cada grupo trabaja sus territorios; el encargado los marca como terminados')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {!congFija && (
          <select value={congSel} onChange={e => setCongSel(e.target.value)} className="w-56">
            <option value="">{tx('Selecciona una congregación...')}</option>
            {congregaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        {puedeGestionar && congSel && (
          <button className="btn btn-primary" onClick={() => setForm({ nombre: '', color: COLORES[grupos.length % COLORES.length], encargado_id: '' })}>
            <Plus size={16} /> {tx('Nuevo grupo')}
          </button>
        )}
        </div>
      </div>

      {/* Tarjetas de grupos */}
      {!congSel ? (
        <div className="card text-center py-10 mb-6">
          <UsersRound size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold text-primary">{tx('Selecciona una congregación')}</p>
          <p className="text-sm text-secondary">{tx('Cada congregación tiene sus propios grupos; no se mezclan.')}</p>
        </div>
      ) : disponible === null ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map(i => <div key={i} className="skeleton h-40" />)}
        </div>
      ) : resumen.length === 0 ? (
        <div className="card text-center py-10 mb-6">
          <UsersRound size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold text-primary">{tx('Aún no hay grupos')}</p>
          <p className="text-sm text-secondary">{tx('Crea los grupos de predicación de la congregación para asignarles territorios.')}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {resumen.map(({ grupo, miembros: m, encargado, enProgreso, completadosAnio }) => (
            <div key={grupo.id} className="card relative overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: grupo.color }} />
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-primary m-0 truncate">{grupo.nombre}</h2>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <Crown size={12} style={{ color: '#F59E0B' }} />
                    {encargado ? encargado.nombre : tx('Sin encargado')}
                  </p>
                </div>
                {puedeGestionar && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      className="p-2 rounded-lg"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                      onClick={() => setForm({ id: grupo.id, nombre: grupo.nombre, color: grupo.color || COLORES[0], encargado_id: grupo.encargado_id || '' })}
                      aria-label={tx('Editar grupo')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="p-2 rounded-lg"
                      style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}
                      onClick={() => setBorrar(grupo)}
                      aria-label={tx('Eliminar grupo')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="rounded-lg py-2" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-lg font-extrabold text-primary leading-none">{m.length}</p>
                  <p className="text-[10px] text-muted mt-1">{tx('Publicadores')}</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <p className="text-lg font-extrabold leading-none" style={{ color: '#F59E0B' }}>{enProgreso.length}</p>
                  <p className="text-[10px] text-muted mt-1">{tx('En progreso')}</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <p className="text-lg font-extrabold leading-none" style={{ color: '#10B981' }}>{completadosAnio}</p>
                  <p className="text-[10px] text-muted mt-1">{tx('Terminados {anio}', { anio: anioActual })}</p>
                </div>
              </div>

              {enProgreso.length > 0 && (
                <div className="flex flex-col gap-1 mb-3">
                  {enProgreso.map(tr => {
                    const terr = territorios.find(t => String(t.id) === String(tr.territorio_id));
                    return (
                      <p key={tr.id} className="text-xs text-secondary flex items-center gap-1.5 truncate">
                        <MapIcon size={12} style={{ color: '#F59E0B' }} className="shrink-0" />
                        <span className="truncate">{nombreTerritorio(terr)}</span>
                        <span className="text-muted shrink-0">· {tx('desde {fecha}', { fecha: formatFechaCorta(tr.fecha_inicio) })}</span>
                      </p>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-1">
                {m.slice(0, 8).map(u => (
                  <span key={u.id} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${grupo.color}1A`, color: 'var(--text-secondary)', border: `1px solid ${grupo.color}40` }}>
                    {u.nombre}
                  </span>
                ))}
                {m.length > 8 && <span className="text-[11px] text-muted px-1">+{m.length - 8}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Publicadores → grupo */}
      {grupos.length > 0 && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-bold text-primary m-0">{tx('Publicadores por grupo')}</h2>
              <p className="text-xs text-secondary">
                {sinGrupo > 0 ? <span style={{ color: '#F59E0B' }}>{tx('{n} sin grupo asignado', { n: sinGrupo })}</span> : <span className="flex items-center gap-1"><CheckCircle2 size={12} style={{ color: '#10B981' }} /> {tx('Todos tienen grupo')}</span>}
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" />
              <input className="pl-9" placeholder={tx('Buscar publicador...')} value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1 md:grid-cols-2">
            {miembrosFiltrados.map(u => {
              const g = grupos.find(x => String(x.id) === String(u.grupo_id));
              return (
                <div key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g?.color || 'transparent', border: g ? 'none' : '1.5px dashed var(--text-muted)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{u.nombre}</p>
                    <p className="text-[11px] text-muted truncate">{tx(u.rol)}</p>
                  </div>
                  <select
                    value={u.grupo_id || ''}
                    disabled={!puedeGestionar}
                    onChange={e => cambiarGrupo(u, e.target.value)}
                    className="w-40 text-xs py-1.5"
                  >
                    <option value="">{tx('Sin grupo')}</option>
                    {grupos.map(gr => <option key={gr.id} value={gr.id}>{gr.nombre}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Crear / editar grupo */}
      {form && (
        <ModalOverlay onClose={() => setForm(null)} size="small">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold m-0" style={{ color: '#0F172A' }}>{form.id ? tx('Editar grupo') : tx('Nuevo grupo')}</h2>
            <button onClick={() => setForm(null)} aria-label={tx('Cerrar')} style={{ color: '#64748B' }}><X size={18} /></button>
          </div>
          <div className="form-group">
            <label className="form-label">{tx('Nombre *')}</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder={tx('Ej. Grupo 1, Grupo Norte')} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{tx('Color')}</label>
            <div className="flex flex-wrap gap-2">
              {COLORES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-8 h-8 rounded-full"
                  style={{ background: c, boxShadow: form.color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : 'none' }}
                  aria-label={`${tx('Color')} ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{tx('Encargado (superintendente de grupo)')}</label>
            <select value={form.encargado_id} onChange={e => setForm(f => ({ ...f, encargado_id: e.target.value }))}>
              <option value="">{tx('Sin encargado')}</option>
              {miembros.filter(m => m.activo !== false).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: '#64748B' }}>{tx('El encargado puede marcar como terminados los territorios de su grupo.')}</p>
          </div>
          <div className="flex gap-3 mt-5">
            <button className="btn btn-outline flex-1" onClick={() => setForm(null)}>{tx('Cancelar')}</button>
            <button className="btn btn-primary flex-1" onClick={guardar} disabled={guardando}>
              {guardando ? tx('Guardando...') : tx('Guardar')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {borrar && (
        <ConfirmModal
          message={tx('¿Eliminar el grupo "{nombre}"?', { nombre: borrar.nombre })}
          detail={tx('Sus publicadores quedarán sin grupo. El historial de territorios trabajados se conserva.')}
          confirmText={tx('Sí, eliminar')}
          danger
          onConfirm={async () => {
            try { await eliminarGrupo(borrar.id); toast.success(tx('Grupo eliminado')); }
            catch (err) { toast.error(`${tx('Error')}: ${err.message}`); }
            setBorrar(null);
          }}
          onCancel={() => setBorrar(null)}
        />
      )}
    </div>
  );
};

export default Grupos;
