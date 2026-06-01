import React, { useState } from 'react';
import ModalOverlay from './ModalOverlay';
import ConfirmModal from './ConfirmModal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { X } from 'lucide-react';

const AsignacionesModal = ({ territorio, onClose }) => {
  const { asignaciones, usuarios, asignarTerritorio, desasignarTerritorio } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ usuario_id: '', fecha_inicio: today, notas: '' });
  const [saving, setSaving] = useState(false);
  const [desasignarTarget, setDesasignarTarget] = useState(null); // objeto asignacion completo

  const activas = asignaciones.filter(
    a => String(a.territorio_id) === String(territorio.id) && a.activa
  );
  const inactivas = asignaciones.filter(
    a => String(a.territorio_id) === String(territorio.id) && !a.activa
  );

  const getNombre = (asig) =>
    asig.app_usuarios?.nombre ||
    usuarios.find(u => String(u.id) === String(asig.usuario_id))?.nombre ||
    'Usuario';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const handleAsignar = async (e) => {
    e.preventDefault();
    if (!form.usuario_id) return;
    setSaving(true);
    try {
      await asignarTerritorio({
        territorio_id: territorio.id,
        usuario_id: Number(form.usuario_id),
        asignado_por: user.id,
        fecha_inicio: form.fecha_inicio,
        notas: form.notas || null,
        activa: true,
      });
      setForm({ usuario_id: '', fecha_inicio: today, notas: '' });
      toast.success('Asignación registrada');
    } catch (err) {
      toast.error('Error al asignar: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDesasignar = async () => {
    try {
      await desasignarTerritorio(desasignarTarget.id);
      setDesasignarTarget(null);
      toast.success('Asignación finalizada');
    } catch (err) {
      toast.error('Error: ' + (err.message || err));
      setDesasignarTarget(null);
    }
  };

  // Excluir del select usuarios que ya tienen asignación activa en este territorio
  const asignadosIds = new Set(activas.map(a => String(a.usuario_id)));
  const usuariosDisponibles = usuarios.filter(u => !asignadosIds.has(String(u.id)));

  return (
    <>
      <ModalOverlay onClose={onClose} size="default">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold" style={{ color: '#0F172A' }}>
            Asignaciones —{' '}
            <span style={{ color: territorio.color || '#2563EB' }}>{territorio.nombre}</span>
          </h3>
          <button
            onClick={onClose}
            className="btn btn-outline p-1.5"
            style={{ borderRadius: '8px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Asignaciones activas */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
            Asignaciones activas
            {activas.length > 0 && (
              <span
                className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}
              >
                {activas.length}
              </span>
            )}
          </h4>
          {activas.length === 0 ? (
            <p className="text-sm" style={{ color: '#64748B' }}>
              Sin asignaciones activas
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activas.map(a => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)' }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                      {getNombre(a)}
                    </p>
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      Desde {formatDate(a.fecha_inicio)}
                    </p>
                    {a.notas && (
                      <p className="text-xs" style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                        {a.notas}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setDesasignarTarget(a)}
                    className="btn btn-outline text-xs py-1.5 px-3"
                    style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
                  >
                    Desasignar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nueva asignación */}
        <div
          className="mb-5 p-4 rounded-xl"
          style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
        >
          <h4 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
            Nueva asignación
          </h4>
          <form onSubmit={handleAsignar}>
            <div className="form-group">
              <label className="form-label">Publicador</label>
              <select
                required
                value={form.usuario_id}
                onChange={e => setForm(f => ({ ...f, usuario_id: e.target.value }))}
              >
                <option value="">Seleccionar publicador...</option>
                {usuariosDisponibles.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
              {usuariosDisponibles.length === 0 && usuarios.length > 0 && (
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                  Todos los usuarios ya tienen asignación activa en este territorio.
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notas (opcional)</label>
              <textarea
                rows={2}
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Instrucciones especiales..."
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={saving || !form.usuario_id}
            >
              {saving ? 'Asignando...' : 'Asignar publicador'}
            </button>
          </form>
        </div>

        {/* Historial */}
        {inactivas.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
              Historial de asignaciones
            </h4>
            <div className="flex flex-col gap-2">
              {inactivas.map(a => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2.5 rounded-lg"
                  style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}
                >
                  <p className="text-sm" style={{ color: '#475569' }}>{getNombre(a)}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    {formatDate(a.fecha_inicio)}
                    {a.fecha_fin ? ` — ${formatDate(a.fecha_fin)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalOverlay>

      {desasignarTarget && (
        <ConfirmModal
          message={`¿Desasignar a ${getNombre(desasignarTarget)} de este territorio?`}
          detail="El publicador dejará de aparecer como asignado. La asignación pasará al historial."
          confirmText="Sí, desasignar"
          danger
          onConfirm={handleDesasignar}
          onCancel={() => setDesasignarTarget(null)}
        />
      )}
    </>
  );
};

export default AsignacionesModal;
