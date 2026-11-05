import React from 'react';
import { Calendar, Clock, Check, X } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import ConfirmModal from './ConfirmModal';
import { formatDate, formatTime } from '../hooks/useExhibidores';
import { t as tx } from '../i18n';

// Piezas de Exhibidores compartidas por la vista 3D y la clásica (estado de hooks/useExhibidores.js).

const ESTADO_BADGE = {
  pendiente:  { bg: '#FEF3C7', color: '#92400E', label: 'Pendiente' },
  aceptado:   { bg: '#D1FAE5', color: '#065F46', label: 'Aceptado' },
  rechazado:  { bg: '#FEE2E2', color: '#991B1B', label: 'Rechazado' },
  completado: { bg: '#DBEAFE', color: '#1E40AF', label: 'Completado' },
};

export const BadgeTurno = ({ estado }) => {
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
      {tx(s.label)}
    </span>
  );
};

// Tarjeta de un turno propio (pestaña "Mis Turnos") con aceptar / rechazar / completado
export const TarjetaMiTurno = ({ turno, onAccion }) => {
  const exhibNombre = turno.exhibidores?.nombre || 'Exhibidor';
  return (
    <div
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={13} /> {formatDate(turno.fecha)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={13} /> {formatTime(turno.hora_inicio)} - {formatTime(turno.hora_fin)}
            </span>
          </div>
        </div>
        <BadgeTurno estado={turno.estado} />
      </div>

      {turno.notas && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 8px 0' }}>{turno.notas}</p>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        {turno.estado === 'pendiente' && (
          <>
            <button
              onClick={() => onAccion(turno, 'aceptado')}
              className="btn btn-primary"
              style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Check size={14} /> {tx('Aceptar')}
            </button>
            <button
              onClick={() => onAccion(turno, 'rechazado')}
              className="btn btn-outline"
              style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px', color: '#DC2626', borderColor: '#DC2626' }}
            >
              <X size={14} /> {tx('Rechazar')}
            </button>
          </>
        )}
        {turno.estado === 'aceptado' && (
          <button
            onClick={() => onAccion(turno, 'completado')}
            className="btn btn-primary"
            style={{ fontSize: '13px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Check size={14} /> {tx('Completado')}
          </button>
        )}
      </div>
    </div>
  );
};

// Modales: asignar turno y confirmar eliminación
export const ModalesExhibidor = ({ ex }) => {
  const {
    usuarios, assignTarget, setAssignTarget, turnoForm, setTurnoForm, savingTurno, handleAssignTurno,
    deleteTarget, setDeleteTarget, handleDelete,
  } = ex;
  return (
    <>
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Publicador *')}</label>
              <select
                required
                value={turnoForm.usuario_id}
                onChange={e => setTurnoForm({ ...turnoForm, usuario_id: e.target.value })}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">{tx('Seleccionar publicador...')}</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Fecha *')}</label>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Hora inicio *')}</label>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Hora fin *')}</label>
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{tx('Notas')}</label>
              <textarea
                value={turnoForm.notas}
                onChange={e => setTurnoForm({ ...turnoForm, notas: e.target.value })}
                className="input"
                placeholder={tx('Notas opcionales...')}
                rows={2}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setAssignTarget(null)} className="btn btn-outline" style={{ flex: 1 }}>
                {tx('Cancelar')}
              </button>
              <button type="submit" disabled={savingTurno} className="btn btn-primary" style={{ flex: 1 }}>
                {savingTurno ? 'Asignando...' : 'Asignar Turno'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

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
    </>
  );
};
