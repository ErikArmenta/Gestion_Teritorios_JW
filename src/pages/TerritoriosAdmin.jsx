import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Polygon, useMap, useMapEvents } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import {
  LandPlot, Plus, Search, Pencil, Trash2, Users, Grid2x2, Share2, Copy, MapPin, Info,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useGrupos } from '../context/GruposContext';
import { useToast } from '../components/Toast';
import { supabase } from '../supabaseClient';
import ModalOverlay from '../components/ModalOverlay';
import ConfirmModal from '../components/ConfirmModal';
import AsignacionesModal from '../components/AsignacionesModal';
import ManzanasModal from '../components/ManzanasModal';
import TerritorioTrabajo from '../components/TerritorioTrabajo';
import DarkTileLayers from '../components/DarkTileLayers';
import LocateButton from '../components/LocateButton';
import { CustomEditControl, GlobalMapFitter } from '../components/MapHelpers';
import { getTerritoryProgress, indexarHistorial, PROGRESO } from '../utils/territoryProgress';
import ZoomAwareLabel from '../components/ZoomAwareLabel';
// "t" se usa para territorios en los .map, por eso la función de traducción es tx
import { t as tx } from '../i18n';

// Gestión de territorios (ancianos, ministeriales y admins): dibujar, editar, eliminar,
// asignaciones, manzanas, grupo y compartir. El mapa principal queda solo para consultar.

const FORM_VACIO = { numero: '', nombre: '', descripcion: '', color: '#3B82F6', responsable: '', congregacion_id_override: '' };

// Vuela al territorio seleccionado
const FlyToTerritorio = ({ territorio }) => {
  const map = useMap();
  useEffect(() => {
    if (!territorio?.coordenadas?.length) return;
    map.flyToBounds(L.polygon(territorio.coordenadas).getBounds(), { padding: [30, 30], maxZoom: 18, duration: 0.8 });
  }, [territorio?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

// Zoom actual del mapa (para el tamaño de las etiquetas)
const ConZoom = ({ children }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return children(zoom);
};

const TerritorioForm = ({ form, setForm, congregaciones, pedirCongregacion }) => (
  <>
    <div className="form-group">
      <label className="form-label">{tx('Número del territorio')}</label>
      <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder={tx('Ej: 1, 2, T-3 (opcional)')} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Nombre *')}</label>
      <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder={tx('Ej: Zona Norte')} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Descripción')}</label>
      <textarea rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Responsable')}</label>
      <input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} placeholder={tx('Nombre del responsable')} />
    </div>
    {pedirCongregacion && (
      <div className="form-group">
        <label className="form-label">{tx('Congregación *')}</label>
        <select required value={form.congregacion_id_override} onChange={e => setForm(f => ({ ...f, congregacion_id_override: e.target.value }))}>
          <option value="">{tx('Seleccionar...')}</option>
          {congregaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
    )}
    <div className="form-group">
      <label className="form-label">{tx('Color del polígono')}</label>
      <div className="flex items-center gap-3">
        <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 p-1 rounded-xl cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.15)' }} />
        <span className="text-sm" style={{ color: '#64748B' }}>{tx('Color visible en el mapa')}</span>
      </div>
    </div>
  </>
);

const TerritoriosAdmin = () => {
  const { territorios, casas, asignaciones, usuarios, manzanas, addTerritorio, updateTerritorio, deleteTerritorio, loading } = useData();
  const { user } = useAuth();
  const { disponible: gruposDisponibles, grupos, trabajos, historial } = useGrupos();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [nuevo, setNuevo] = useState(null);         // coordenadas del polígono recién dibujado
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [editando, setEditando] = useState(null);   // territorio en edición
  const [formEdit, setFormEdit] = useState(FORM_VACIO);
  const [borrar, setBorrar] = useState(null);
  const [asignacionesDe, setAsignacionesDe] = useState(null);
  const [manzanasDe, setManzanasDe] = useState(null);
  const [compartir, setCompartir] = useState(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [congregaciones, setCongregaciones] = useState([]);

  const pedirCongregacion = user?.rol === 'Super Admin' && !user?.congregacion_id;
  useEffect(() => {
    if (!pedirCongregacion) return;
    supabase.from('congregaciones').select('id, nombre').then(({ data }) => setCongregaciones(data || []));
  }, [pedirCongregacion]);

  const progreso = useMemo(() => {
    const ctx = { disponible: !!gruposDisponibles, trabajos, grupos, historialIdx: indexarHistorial(historial) };
    const map = {};
    territorios.forEach(t => { map[t.id] = getTerritoryProgress(t, casas, ctx); });
    return map;
  }, [territorios, casas, gruposDisponibles, trabajos, grupos, historial]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return territorios
      .filter(t => !q || `${t.numero || ''} ${t.nombre || ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.numero || a.nombre).localeCompare(String(b.numero || b.nombre), 'es', { numeric: true }));
  }, [territorios, busqueda]);

  const seleccionado = territorios.find(t => String(t.id) === String(seleccionadoId)) || null;

  const seleccionar = (t, { scroll } = {}) => {
    setSeleccionadoId(t.id);
    if (scroll === 'mapa') document.getElementById('territorios-mapa')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (scroll === 'tarjeta') document.getElementById(`terr-${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ?id=X desde el mapa principal ("Gestionar")
  const idParam = searchParams.get('id');
  useEffect(() => {
    if (!idParam || !territorios.length) return;
    const t = territorios.find(x => String(x.id) === String(idParam));
    if (t) setTimeout(() => seleccionar(t, { scroll: 'tarjeta' }), 300);
  }, [idParam, territorios.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDibujado = useCallback((e) => {
    const { layerType, layer } = e;
    if (layerType === 'polygon' || layerType === 'rectangle') {
      setNuevo(layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]));
      layer.remove();
    }
  }, []);

  const guardarNuevo = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formNuevo, coordenadas: nuevo };
      if (formNuevo.congregacion_id_override) payload.congregacion_id = formNuevo.congregacion_id_override;
      delete payload.congregacion_id_override;
      await addTerritorio(payload);
      setNuevo(null);
      setFormNuevo(FORM_VACIO);
      toast.success(tx('Territorio creado correctamente'));
    } catch (err) {
      toast.error(tx('Error al guardar: ') + (err.message || err));
    }
  };

  const abrirEdicion = (t) => {
    setEditando(t);
    setFormEdit({ numero: t.numero || '', nombre: t.nombre || '', descripcion: t.descripcion || '', color: t.color || '#3B82F6', responsable: t.responsable || '', congregacion_id_override: '' });
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      const { congregacion_id_override, ...datos } = formEdit; // eslint-disable-line no-unused-vars
      await updateTerritorio(editando.id, datos);
      setEditando(null);
      toast.success(tx('Territorio actualizado'));
    } catch (err) {
      toast.error(tx('Error al actualizar: ') + (err.message || err));
    }
  };

  const eliminar = async () => {
    try {
      await deleteTerritorio(borrar.id);
      toast.success(tx('Territorio "{nombre}" eliminado', { nombre: borrar.nombre }));
      if (String(seleccionadoId) === String(borrar.id)) setSeleccionadoId(null);
    } catch (err) {
      toast.error(tx('Error al eliminar: ') + (err.message || err));
    } finally {
      setBorrar(null);
    }
  };

  const generarEnlace = async (t) => {
    setCompartiendo(true);
    try {
      const { data, error } = await supabase
        .from('territorio_compartidos')
        .insert({ territorio_id: t.id, creado_por: user.id, expira_en: new Date(Date.now() + 86400000).toISOString() })
        .select('id')
        .single();
      if (error) throw error;
      setCompartir({ nombre: t.nombre, link: `${window.location.origin}/shared/${data.id}` });
    } catch (err) {
      toast.error(tx('Error al compartir: ') + (err.message || err));
    } finally {
      setCompartiendo(false);
    }
  };

  const nombreUsuario = (a) =>
    a.app_usuarios?.nombre || usuarios.find(u => String(u.id) === String(a.usuario_id))?.nombre || `#${a.usuario_id}`;

  const accion = 'flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors';

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">{tx('Gestión de Territorios')}</h1>
          <p className="text-sm mt-0.5 text-secondary">{tx('Crea, edita y organiza los territorios, sus manzanas y asignaciones')}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            document.getElementById('territorios-mapa')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            toast.info(tx('Para crear un territorio, dibújalo en el mapa con el pentágono (polígono) o el cuadro (rectángulo).'));
          }}
        >
          <Plus size={16} /> {tx('Nuevo territorio')}
        </button>
      </div>

      {/* Mapa para dibujar / ubicar */}
      <div id="territorios-mapa" className="card p-0 overflow-hidden mb-2 isolate" style={{ height: 'min(680px, 72dvh)' }}>
        {!loading && (
          <MapContainer center={[31.7619, -106.4850]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <DarkTileLayers />
            <GlobalMapFitter territorios={territorios} fitKey={0} />
            <CustomEditControl onCreated={handleDibujado} />
            <FlyToTerritorio territorio={seleccionado} />
            {/* Borde = color del territorio; relleno = estado de progreso, más intenso según el % */}
            <ConZoom>{(zoom) => territorios.map(t => {
              const activo = String(t.id) === String(seleccionadoId);
              const p = progreso[t.id];
              const colorEstado = PROGRESO[p?.estado]?.color || '#94A3B8';
              return (
                <Fragment key={t.id}>
                  <Polygon
                    positions={t.coordenadas}
                    pathOptions={{
                      color: t.color,
                      fillColor: colorEstado,
                      fillOpacity: 0.15 + ((p?.pct || 0) / 100) * 0.4 + (activo ? 0.15 : 0),
                      weight: activo ? 4 : 2.5,
                      dashArray: p?.estado === 'sin_trabajar' ? '6 5' : null,
                    }}
                    eventHandlers={{ click: () => seleccionar(t, { scroll: 'tarjeta' }) }}
                  />
                  {/* Etiquetas solo de cerca (de lejos se enciman); el progreso se ve por el relleno */}
                  <ZoomAwareLabel coordenadas={t.coordenadas} numero={t.numero} nombre={t.nombre} color={t.color} zoom={zoom} minZoom={17} progreso={p} />
                </Fragment>
              );
            })}</ConZoom>
            {manzanas.map(m => (
              <Polygon key={`m-${m.id}`} positions={m.coordenadas} interactive={false}
                pathOptions={{ color: m.color || '#94A3B8', fillOpacity: 0.08, weight: 1.5, dashArray: '5 4' }} />
            ))}
            <LocateButton />
          </MapContainer>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-1 mt-1">
        {Object.values(PROGRESO).map(p => (
          <span key={p.label} className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="legend-dot w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            {tx(p.label)}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted mb-4 flex items-center gap-1.5">
        <Info size={12} /> {tx('Dibuja un territorio con las herramientas del mapa. Toca un territorio para ver su tarjeta.')}
      </p>

      {/* Búsqueda */}
      <div className="relative mb-4 sm:max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" />
        <input className="pl-9" placeholder={tx('Buscar territorio...')} value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Tarjetas */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="skeleton h-56" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="card text-center py-10">
          <LandPlot size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm text-secondary">{tx('No hay territorios registrados.')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map(t => {
            const activo = String(t.id) === String(seleccionadoId);
            const numCasas = casas.filter(c => String(c.territorio_id) === String(t.id)).length;
            const asignados = asignaciones.filter(a => String(a.territorio_id) === String(t.id) && a.activa);
            return (
              <div
                key={t.id}
                id={`terr-${t.id}`}
                className="card p-4 flex flex-col gap-3"
                style={{ borderLeft: `4px solid ${t.color || '#3B82F6'}`, boxShadow: activo ? `0 0 0 2px ${t.color || '#3B82F6'}` : undefined }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-primary truncate">
                      {t.numero && String(t.numero) !== String(t.nombre) && (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 mr-1.5 rounded-full text-[11px] font-extrabold text-white align-middle" style={{ background: t.color || '#3B82F6' }}>
                          {t.numero}
                        </span>
                      )}
                      {t.nombre}
                    </p>
                    {t.descripcion && <p className="text-xs text-secondary line-clamp-2">{t.descripcion}</p>}
                    <p className="text-[11px] text-muted mt-0.5">
                      {tx('{n} casas', { n: numCasas })}
                      {t.responsable ? ` · ${tx('Responsable:')} ${t.responsable}` : ''}
                    </p>
                    <p className="text-[11px] text-muted truncate">
                      {asignados.length ? `${tx('Asignados:')} ${asignados.map(nombreUsuario).join(', ')}` : tx('Sin asignaciones')}
                    </p>
                  </div>
                  <button
                    className="shrink-0 p-2 rounded-lg"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                    onClick={() => seleccionar(t, { scroll: 'mapa' })}
                    title={tx('Ver en el mapa')}
                    aria-label={tx('Ver en el mapa')}
                  >
                    <MapPin size={15} />
                  </button>
                </div>

                {/* Progreso + grupo (asignar / terminar) — panel oscuro como en el mapa */}
                <div className="rounded-xl p-2" style={{ background: '#0F172A' }}>
                  <TerritorioTrabajo territorio={t} progreso={progreso[t.id]} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button className={accion} style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }} onClick={() => abrirEdicion(t)}>
                    <Pencil size={13} /> {tx('Editar')}
                  </button>
                  <button className={accion} style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }} onClick={() => setAsignacionesDe(t)}>
                    <Users size={13} /> {tx('Asignaciones')}
                  </button>
                  <button className={accion} style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }} onClick={() => setManzanasDe(t)}>
                    <Grid2x2 size={13} /> {tx('Manzanas')}
                  </button>
                  <button className={accion} style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED' }} disabled={compartiendo} onClick={() => generarEnlace(t)}>
                    <Share2 size={13} /> {compartiendo ? tx('Generando...') : tx('Compartir')}
                  </button>
                  <button
                    className={`${accion} col-span-2 sm:col-span-2`}
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}
                    onClick={() => setBorrar({ id: t.id, nombre: t.nombre, count: numCasas })}
                  >
                    <Trash2 size={13} /> {tx('Eliminar')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nuevo territorio (después de dibujar) */}
      {nuevo && (
        <ModalOverlay onClose={() => setNuevo(null)}>
          <h3 className="text-lg font-bold mb-5" style={{ color: '#0F172A' }}>{tx('Nuevo Territorio')}</h3>
          <form onSubmit={guardarNuevo}>
            <TerritorioForm form={formNuevo} setForm={setFormNuevo} congregaciones={congregaciones} pedirCongregacion={pedirCongregacion} />
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setNuevo(null)}>{tx('Cancelar')}</button>
              <button type="submit" className="btn btn-primary flex-1">{tx('Guardar Territorio')}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* Editar */}
      {editando && (
        <ModalOverlay onClose={() => setEditando(null)}>
          <h3 className="text-lg font-bold mb-5" style={{ color: '#0F172A' }}>{tx('Editar territorio')}</h3>
          <form onSubmit={guardarEdicion}>
            <TerritorioForm form={formEdit} setForm={setFormEdit} congregaciones={congregaciones} pedirCongregacion={false} />
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setEditando(null)}>{tx('Cancelar')}</button>
              <button type="submit" className="btn btn-primary flex-1">{tx('Guardar')}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {asignacionesDe && <AsignacionesModal territorio={asignacionesDe} onClose={() => setAsignacionesDe(null)} />}
      {manzanasDe && <ManzanasModal territorio={manzanasDe} onClose={() => setManzanasDe(null)} />}

      {/* Compartir */}
      {compartir && (
        <ModalOverlay onClose={() => setCompartir(null)} size="small">
          <div className="flex items-center gap-2 mb-4">
            <Share2 size={18} style={{ color: '#7C3AED' }} />
            <h3 className="text-lg font-bold" style={{ color: '#0F172A' }}>{tx('Compartir Territorio')}</h3>
          </div>
          <p className="text-sm mb-4" style={{ color: '#475569' }}>{compartir.nombre}</p>
          <div className="form-group">
            <label className="form-label">{tx('Enlace de acceso')}</label>
            <div className="flex gap-2 items-center">
              <input readOnly value={compartir.link} className="flex-1 text-xs" onFocus={e => e.target.select()} />
              <button
                className="btn btn-outline shrink-0"
                onClick={() => { navigator.clipboard.writeText(compartir.link); toast.success(tx('Enlace copiado al portapapeles')); }}
              >
                <Copy size={13} /> {tx('Copiar')}
              </button>
            </div>
          </div>
          <p className="text-xs mt-2 mb-5" style={{ color: '#64748B' }}>{tx('Este enlace expira en 24 horas.')}</p>
          <div className="flex gap-3">
            <button className="btn btn-outline flex-1" onClick={() => setCompartir(null)}>{tx('Cerrar')}</button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${tx('Territorio compartido:')} ${compartir.link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex-1"
              style={{ textDecoration: 'none' }}
            >
              <Share2 size={14} /> WhatsApp
            </a>
          </div>
        </ModalOverlay>
      )}

      {borrar && (
        <ConfirmModal
          message={tx('¿Eliminar el territorio "{nombre}"?', { nombre: borrar.nombre })}
          detail={borrar.count > 0
            ? tx('También se eliminarán las {n} casas registradas en este territorio.', { n: borrar.count })
            : tx('Este territorio no tiene casas registradas.')}
          confirmText={tx('Sí, eliminar')}
          danger
          onConfirm={eliminar}
          onCancel={() => setBorrar(null)}
        />
      )}
    </div>
  );
};

export default TerritoriosAdmin;
