import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { MapPin, Plus, Clock, Calendar, Trash2, Check, X, ShoppingCart } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useNotifications } from '../context/NotificationContext';
import ModalOverlay from '../components/ModalOverlay';
import ConfirmModal from '../components/ConfirmModal';
import L from 'leaflet';

const ADMIN_ROLES = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

const exhibidorIcon = (color = '#F59E0B') => L.divIcon({
  className: '',
  html: `<div style="
    width: 32px; height: 32px;
    background: ${color};
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  ">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const LocationMarker = ({ position, setPosition }) => {
  useMapEvents({ click(e) { setPosition(e.latlng); } });
  if (!position) return null;
  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => setPosition(e.target.getLatLng()),
      }}
    />
  );
};

const ESTADO_BADGE = {
  pendiente:  { bg: '#FEF3C7', color: '#92400E', label: 'Pendiente' },
  aceptado:   { bg: '#D1FAE5', color: '#065F46', label: 'Aceptado' },
  rechazado:  { bg: '#FEE2E2', color: '#991B1B', label: 'Rechazado' },
  completado: { bg: '#DBEAFE', color: '#1E40AF', label: 'Completado' },
};

const Badge = ({ estado }) => {
  const s = ESTADO_BADGE[estado] || ESTADO_BADGE.pendiente;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (t) => {
  if (!t) return '';
  return t.substring(0, 5);
};

const Exhibidores = () => {
  const { user } = useAuth();
  const {
    exhibidores, exhibidorTurnos, usuarios,
    addExhibidor, updateExhibidor, deleteExhibidor,
    addExhibidorTurno, updateExhibidorTurno, deleteExhibidorTurno,
  } = useData();
  const toast = useToast();
  const { createNotification } = useNotifications();

  const isAdmin = ADMIN_ROLES.includes(user?.rol);
  const [activeTab, setActiveTab] = useState(isAdmin ? 'ubicaciones' : 'turnos');

  // --- New exhibidor form ---
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', descripcion: '', direccion: '' });
  const [newPosition, setNewPosition] = useState(null);
  const [savingNew, setSavingNew] = useState(false);

  // --- Assign turno modal ---
  const [assignTarget, setAssignTarget] = useState(null); // exhibidor obj
  const [turnoForm, setTurnoForm] = useState({ usuario_id: '', fecha: '', hora_inicio: '', hora_fin: '', notas: '' });
  const [savingTurno, setSavingTurno] = useState(false);

  // --- Delete confirm ---
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'exhibidor'|'turno', id, name }

  // --- Turnos del usuario logueado ---
  const misTurnos = useMemo(() => {
    if (!user) return [];
    return exhibidorTurnos
      .filter(t => Number(t.usuario_id) === Number(user.id))
      .sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  }, [exhibidorTurnos, user]);

  const today = new Date().toISOString().split('T')[0];

  // Turnos proximos de un exhibidor
  const getTurnosExhibidor = (exhibidorId) =>
    exhibidorTurnos.filter(t => Number(t.exhibidor_id) === Number(exhibidorId) && t.fecha >= today);

  // ====== Handlers ======

  const handleCreateExhibidor = async (e) => {
    e.preventDefault();
    if (!newPosition) { toast.error('Haz click en el mapa para ubicar el exhibidor'); return; }
    setSavingNew(true);
    try {
      await addExhibidor({
        nombre: newForm.nombre,
        descripcion: newForm.descripcion || null,
        direccion: newForm.direccion || null,
        latitud: newPosition.lat,
        longitud: newPosition.lng,
      });
      toast.success('Exhibidor creado');
      setShowNewForm(false);
      setNewForm({ nombre: '', descripcion: '', direccion: '' });
      setNewPosition(null);
    } catch (err) {
      toast.error('Error: ' + (err.message || err));
    } finally {
      setSavingNew(false);
    }
  };

  const handleAssignTurno = async (e) => {
    e.preventDefault();
    if (!turnoForm.usuario_id || !turnoForm.fecha || !turnoForm.hora_inicio || !turnoForm.hora_fin) return;
    setSavingTurno(true);
    try {
      await addExhibidorTurno({
        exhibidor_id: assignTarget.id,
        usuario_id: Number(turnoForm.usuario_id),
        fecha: turnoForm.fecha,
        hora_inicio: turnoForm.hora_inicio,
        hora_fin: turnoForm.hora_fin,
        notas: turnoForm.notas || null,
      });
      try {
        await createNotification({
          usuario_destino_id: Number(turnoForm.usuario_id),
          tipo: 'exhibidor',
          titulo: 'Turno de exhibidor asignado',
          mensaje: `Se te asigno un turno en "${assignTarget.nombre}" el ${formatDate(turnoForm.fecha)} de ${formatTime(turnoForm.hora_inicio)} a ${formatTime(turnoForm.hora_fin)}`,
        });
      } catch {}
      toast.success('Turno asignado');
      setAssignTarget(null);
      setTurnoForm({ usuario_id: '', fecha: '', hora_inicio: '', hora_fin: '', notas: '' });
    } catch (err) {
      toast.error('Error: ' + (err.message || err));
    } finally {
      setSavingTurno(false);
    }
  };

  const handleTurnoAction = async (turno, accion) => {
    try {
      await updateExhibidorTurno(turno.id, { estado: accion });
      const exhibNombre = turno.exhibidores?.nombre || 'exhibidor';
      const fechaStr = formatDate(turno.fecha);
      const notifMap = {
        aceptado: { titulo: 'Turno aceptado', mensaje: `${user.nombre} acepto el turno en "${exhibNombre}" del ${fechaStr}` },
        rechazado: { titulo: 'Turno rechazado', mensaje: `${user.nombre} rechazo el turno en "${exhibNombre}" del ${fechaStr}` },
        completado: { titulo: 'Turno completado', mensaje: `${user.nombre} completo el turno en "${exhibNombre}" del ${fechaStr}` },
      };
      if (turno.asignado_por && notifMap[accion]) {
        try {
          await createNotification({
            usuario_destino_id: turno.asignado_por,
            tipo: 'exhibidor_respuesta',
            ...notifMap[accion],
          });
        } catch {}
      }
      toast.success(accion === 'aceptado' ? 'Turno aceptado' : accion === 'rechazado' ? 'Turno rechazado' : 'Turno completado');
    } catch (err) {
      toast.error('Error: ' + (err.message || err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'exhibidor') await deleteExhibidor(deleteTarget.id);
      else await deleteExhibidorTurno(deleteTarget.id);
      toast.success('Eliminado');
    } catch (err) {
      toast.error('Error: ' + (err.message || err));
    } finally {
      setDeleteTarget(null);
    }
  };

  // ====== Map center from exhibidores ======
  const mapCenter = useMemo(() => {
    if (exhibidores.length === 0) return [19.4326, -99.1332];
    const lat = exhibidores.reduce((s, e) => s + e.latitud, 0) / exhibidores.length;
    const lng = exhibidores.reduce((s, e) => s + e.longitud, 0) / exhibidores.length;
    return [lat, lng];
  }, [exhibidores]);

  // ====== Render ======
  return (
    <div style={{ flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <ShoppingCart size={24} style={{ color: '#F59E0B' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Exhibidores</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--bg-hover)', borderRadius: '12px', padding: '4px' }}>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('ubicaciones')}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
              background: activeTab === 'ubicaciones' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'ubicaciones' ? '#2563EB' : 'var(--text-secondary)',
              boxShadow: activeTab === 'ubicaciones' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            Ubicaciones
          </button>
        )}
        <button
          onClick={() => setActiveTab('turnos')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
            background: activeTab === 'turnos' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'turnos' ? '#2563EB' : 'var(--text-secondary)',
            boxShadow: activeTab === 'turnos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Clock size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
          Mis Turnos
        </button>
      </div>

      {/* ====== TAB: UBICACIONES ====== */}
      {activeTab === 'ubicaciones' && isAdmin && (
        <div>
          {/* Mini mapa */}
          <div style={{ borderRadius: '16px', overflow: 'hidden', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
            <MapContainer
              center={mapCenter}
              zoom={14}
              style={{ height: '280px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                className="neon-labels"
              />
              {exhibidores.filter(e => e.activo !== false).map(e => (
                <Marker key={e.id} position={[e.latitud, e.longitud]} icon={exhibidorIcon(e.color || '#F59E0B')} />
              ))}
            </MapContainer>
          </div>

          {/* Boton nuevo exhibidor */}
          <button
            onClick={() => setShowNewForm(true)}
            className="btn btn-primary"
            style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Nuevo Exhibidor
          </button>

          {/* Lista de exhibidores */}
          {exhibidores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px' }}>No hay exhibidores registrados</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {exhibidores.map(exh => {
                const turnos = getTurnosExhibidor(exh.id);
                return (
                  <div
                    key={exh.id}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: '16px',
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: exh.color || '#F59E0B',
                          }} />
                          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{exh.nombre}</h3>
                        </div>
                        {exh.direccion && (
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{exh.direccion}</p>
                        )}
                        {exh.descripcion && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{exh.descripcion}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setDeleteTarget({ type: 'exhibidor', id: exh.id, name: exh.nombre })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '4px' }}
                        title="Eliminar exhibidor"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Turnos proximos */}
                    {turnos.length > 0 && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                          Turnos proximos ({turnos.length})
                        </p>
                        {turnos.slice(0, 3).map(t => (
                          <div
                            key={t.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '6px 0', fontSize: '13px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                {t.usuario?.nombre || 'Usuario'}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {formatDate(t.fecha)} {formatTime(t.hora_inicio)}-{formatTime(t.hora_fin)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Badge estado={t.estado} />
                              {isAdmin && (
                                <button
                                  onClick={() => setDeleteTarget({ type: 'turno', id: t.id, name: `turno de ${t.usuario?.nombre || 'usuario'}` })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '2px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {turnos.length > 3 && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            +{turnos.length - 3} mas...
                          </p>
                        )}
                      </div>
                    )}

                    {/* Boton asignar turno */}
                    <button
                      onClick={() => {
                        setAssignTarget(exh);
                        setTurnoForm({ usuario_id: '', fecha: today, hora_inicio: '09:00', hora_fin: '11:00', notas: '' });
                      }}
                      className="btn btn-outline"
                      style={{ marginTop: '10px', fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Calendar size={14} /> Asignar Turno
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====== TAB: MIS TURNOS ====== */}
      {activeTab === 'turnos' && (
        <div>
          {misTurnos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <Clock size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px' }}>No tienes turnos asignados</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {misTurnos.map(turno => {
                const exhibNombre = turno.exhibidores?.nombre || 'Exhibidor';
                return (
                  <div
                    key={turno.id}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: '16px',
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                          {exhibNombre}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={13} /> {formatDate(turno.fecha)}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={13} /> {formatTime(turno.hora_inicio)} - {formatTime(turno.hora_fin)}
                          </span>
                        </div>
                      </div>
                      <Badge estado={turno.estado} />
                    </div>

                    {turno.notas && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 8px 0' }}>{turno.notas}</p>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      {turno.estado === 'pendiente' && (
                        <>
                          <button
                            onClick={() => handleTurnoAction(turno, 'aceptado')}
                            className="btn btn-primary"
                            style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Check size={14} /> Aceptar
                          </button>
                          <button
                            onClick={() => handleTurnoAction(turno, 'rechazado')}
                            className="btn btn-outline"
                            style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px', color: '#DC2626', borderColor: '#DC2626' }}
                          >
                            <X size={14} /> Rechazar
                          </button>
                        </>
                      )}
                      {turno.estado === 'aceptado' && (
                        <button
                          onClick={() => handleTurnoAction(turno, 'completado')}
                          className="btn btn-primary"
                          style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Check size={14} /> Completado
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====== MODAL: Nuevo Exhibidor ====== */}
      {showNewForm && (
        <ModalOverlay onClose={() => setShowNewForm(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Nuevo Exhibidor</h2>
            <button onClick={() => setShowNewForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreateExhibidor}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Nombre *</label>
              <input
                type="text"
                required
                value={newForm.nombre}
                onChange={e => setNewForm({ ...newForm, nombre: e.target.value })}
                className="input"
                placeholder="Ej: Parque Central"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Direccion</label>
              <input
                type="text"
                value={newForm.direccion}
                onChange={e => setNewForm({ ...newForm, direccion: e.target.value })}
                className="input"
                placeholder="Ej: Av. Juarez #123"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Descripcion</label>
              <textarea
                value={newForm.descripcion}
                onChange={e => setNewForm({ ...newForm, descripcion: e.target.value })}
                className="input"
                placeholder="Detalles del exhibidor..."
                rows={2}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
                Ubicacion * <span style={{ fontWeight: 400, color: '#94A3B8' }}>(click en el mapa o arrastra el marcador)</span>
              </label>
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={14}
                  style={{ height: '220px', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                  />
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                    className="neon-labels"
                  />
                  <LocationMarker position={newPosition} setPosition={setNewPosition} />
                </MapContainer>
              </div>
              {newPosition && (
                <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  Lat: {newPosition.lat.toFixed(6)}, Lng: {newPosition.lng.toFixed(6)}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setShowNewForm(false)} className="btn btn-outline" style={{ flex: 1 }}>
                Cancelar
              </button>
              <button type="submit" disabled={savingNew} className="btn btn-primary" style={{ flex: 1 }}>
                {savingNew ? 'Guardando...' : 'Crear Exhibidor'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ====== MODAL: Asignar Turno ====== */}
      {assignTarget && (
        <ModalOverlay onClose={() => setAssignTarget(null)} size="small">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Asignar Turno — {assignTarget.nombre}
            </h2>
            <button onClick={() => setAssignTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleAssignTurno}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Publicador *</label>
              <select
                required
                value={turnoForm.usuario_id}
                onChange={e => setTurnoForm({ ...turnoForm, usuario_id: e.target.value })}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">Seleccionar publicador...</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Fecha *</label>
              <input
                type="date"
                required
                value={turnoForm.fecha}
                onChange={e => setTurnoForm({ ...turnoForm, fecha: e.target.value })}
                className="input"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Hora inicio *</label>
                <input
                  type="time"
                  required
                  value={turnoForm.hora_inicio}
                  onChange={e => setTurnoForm({ ...turnoForm, hora_inicio: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Hora fin *</label>
                <input
                  type="time"
                  required
                  value={turnoForm.hora_fin}
                  onChange={e => setTurnoForm({ ...turnoForm, hora_fin: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Notas</label>
              <textarea
                value={turnoForm.notas}
                onChange={e => setTurnoForm({ ...turnoForm, notas: e.target.value })}
                className="input"
                placeholder="Notas opcionales..."
                rows={2}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setAssignTarget(null)} className="btn btn-outline" style={{ flex: 1 }}>
                Cancelar
              </button>
              <button type="submit" disabled={savingTurno} className="btn btn-primary" style={{ flex: 1 }}>
                {savingTurno ? 'Asignando...' : 'Asignar Turno'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ====== MODAL: Confirmar eliminacion ====== */}
      {deleteTarget && (
        <ConfirmModal
          message={`Eliminar ${deleteTarget.name}?`}
          detail="Esta accion no se puede deshacer."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmText="Eliminar"
          danger
        />
      )}
    </div>
  );
};

export default Exhibidores;
