import React, { lazy } from 'react';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import { MapPin, Plus, Clock, Calendar, Trash2, X, Box } from 'lucide-react';
import ModalOverlay from '../components/ModalOverlay';
import L from 'leaflet';
import ExhibidorIcon from '../components/ExhibidorIcon';
import { EXHIBIDOR_ICON_SVG_PATHS } from '../utils/constants';
import DarkTileLayers from '../components/DarkTileLayers';
import LocateButton from '../components/LocateButton';
import ElegirVista from '../components/Vista3D';
import { BadgeTurno, TarjetaMiTurno, ModalesExhibidor } from '../components/ExhibidorPiezas';
import useExhibidores, { formatDate, formatTime } from '../hooks/useExhibidores';
import { t as tx } from '../i18n';

// Exhibidores, vista clásica (Leaflet): respaldo cuando no hay WebGL2 o falla el 3D.
// La vista normal es Exhibidores3D (mapa de fondo compartido). Lógica compartida: hooks/useExhibidores.js

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
      ${EXHIBIDOR_ICON_SVG_PATHS}
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

const ExhibidoresClasica = ({ onVista3D }) => {
  const ex = useExhibidores();
  const {
    isAdmin, exhibidores, misTurnos, getTurnosExhibidor, mapCenter,
    activeTab, setActiveTab,
    showNewForm, setShowNewForm, newForm, setNewForm, newPosition, setNewPosition, savingNew, handleCreateExhibidor,
    abrirAsignar, handleTurnoAction, setDeleteTarget,
  } = ex;

  return (
    <div style={{ flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <ExhibidorIcon size={24} style={{ color: '#F59E0B' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, flex: 1 }}>{tx('Exhibidores')}</h1>
        {onVista3D && (
          <button type="button" className="btn btn-outline flex items-center gap-1.5" onClick={onVista3D}>
            <Box size={16} /> {tx('Mapa 3D')}
          </button>
        )}
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
            {tx('Ubicaciones')}
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
          {tx('Mis Turnos')}
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
              style={{ height: 'min(450px, 55dvh)', width: '100%' }}
              scrollWheelZoom={true}
            >
              <DarkTileLayers />
              {exhibidores.filter(e => e.activo !== false).map(e => (
                <Marker key={e.id} position={[e.latitud, e.longitud]} icon={exhibidorIcon(e.color || '#F59E0B')} />
              ))}
              <LocateButton />
            </MapContainer>
          </div>

          {/* Boton nuevo exhibidor */}
          <button
            onClick={() => setShowNewForm(true)}
            className="btn btn-primary"
            style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> {tx('Nuevo Exhibidor')}
          </button>

          {/* Lista de exhibidores */}
          {exhibidores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <ExhibidorIcon size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px' }}>{tx('No hay exhibidores registrados')}</p>
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
                        title={tx('Eliminar exhibidor')}
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
                              <BadgeTurno estado={t.estado} />
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
                      onClick={() => abrirAsignar(exh)}
                      className="btn btn-outline"
                      style={{ marginTop: '10px', fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Calendar size={14} /> {tx('Asignar Turno')}
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
              <p style={{ fontSize: '14px' }}>{tx('No tienes turnos asignados')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {misTurnos.map(turno => <TarjetaMiTurno key={turno.id} turno={turno} onAccion={handleTurnoAction} />)}
            </div>
          )}
        </div>
      )}

      {/* ====== MODAL: Nuevo Exhibidor ====== */}
      {showNewForm && (
        <ModalOverlay onClose={() => setShowNewForm(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>{tx('Nuevo Exhibidor')}</h2>
            <button onClick={() => setShowNewForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreateExhibidor}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Nombre *')}</label>
              <input
                type="text"
                required
                value={newForm.nombre}
                onChange={e => setNewForm({ ...newForm, nombre: e.target.value })}
                className="input"
                placeholder={tx('Ej: Parque Central')}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Direccion')}</label>
              <input
                type="text"
                value={newForm.direccion}
                onChange={e => setNewForm({ ...newForm, direccion: e.target.value })}
                className="input"
                placeholder={tx('Ej: Av. Juarez #123')}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Descripcion')}</label>
              <textarea
                value={newForm.descripcion}
                onChange={e => setNewForm({ ...newForm, descripcion: e.target.value })}
                className="input"
                placeholder={tx('Detalles del exhibidor...')}
                rows={2}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
                {tx('Ubicacion *')} <span style={{ fontWeight: 400, color: '#94A3B8' }}>{tx('(click en el mapa o arrastra el marcador)')}</span>
              </label>
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={14}
                  style={{ height: '320px', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <DarkTileLayers />
                  <LocationMarker position={newPosition} setPosition={setNewPosition} />
                  <LocateButton onLocate={(latlng) => setNewPosition(latlng)} />
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
                {tx('Cancelar')}
              </button>
              <button type="submit" disabled={savingNew} className="btn btn-primary" style={{ flex: 1 }}>
                {savingNew ? 'Guardando...' : 'Crear Exhibidor'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      <ModalesExhibidor ex={ex} />
    </div>
  );
};

// ── Elección de vista ──────────────────────────────────────────────────────────────────
// 3D con el mapa de fondo compartido (Exhibidores3D); la clásica solo como respaldo. Ver components/Vista3D.jsx.
const Exhibidores3D = lazy(() => import('./Exhibidores3D'));

const Exhibidores = () => (
  <ElegirVista
    Vista3DComp={Exhibidores3D}
    render={(onVista3D) => <ExhibidoresClasica onVista3D={onVista3D} />}
  />
);

export default Exhibidores;
