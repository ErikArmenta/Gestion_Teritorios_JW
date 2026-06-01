import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import { STATUS_OPTIONS, getStatusBadge, getStatusColor } from '../utils/constants';
import { Trash2, ChevronDown, ImageOff, ZoomIn, X, Search } from 'lucide-react';

const HousesList = () => {
  const { casas, territorios, deleteCasa, updateCasa, insertarHistorialVisita, loading } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const [searchTerm, setSearchTerm]           = useState('');
  const [filterTerritory, setFilterTerritory] = useState('Todos');
  const [filterStatus, setFilterStatus]       = useState('Todos');
  const [deleteTarget, setDeleteTarget]       = useState(null);
  const [editStatusId, setEditStatusId]       = useState(null);
  const [lightboxUrl, setLightboxUrl]         = useState(null);
  const [visitaModal, setVisitaModal]         = useState(null); // {id, estadoActual, nuevoEstado}
  const [visitaNotas, setVisitaNotas]         = useState('');
  const [savingVisita, setSavingVisita]       = useState(false);

  useEffect(() => {
    if (!lightboxUrl) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightboxUrl]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
      </div>
    );
  }

  const filteredCasas = casas.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchSearch = c.direccion.toLowerCase().includes(q) ||
                        (c.nombre_contacto?.toLowerCase().includes(q)) ||
                        (c.territorio_nombre?.toLowerCase().includes(q));
    const matchTerritory = filterTerritory === 'Todos' || String(c.territorio_id) === String(filterTerritory);
    const matchStatus    = filterStatus    === 'Todos' || c.estado === filterStatus;
    return matchSearch && matchTerritory && matchStatus;
  });

  const handleDelete = async () => {
    try {
      await deleteCasa(deleteTarget.id);
      toast.success('Casa eliminada correctamente');
    } catch {
      toast.error('Error al eliminar la casa. Verifica los permisos.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (id, nuevoEstado) => {
    try {
      await updateCasa(id, { estado: nuevoEstado });
      toast.success('Estado actualizado');
    } catch {
      toast.error('Error al actualizar el estado');
    } finally {
      setEditStatusId(null);
    }
  };

  const handleConfirmVisita = async () => {
    if (!visitaModal) return;
    setSavingVisita(true);
    try {
      await insertarHistorialVisita({
        casa_id: visitaModal.id,
        usuario_id: user?.id || null,
        usuario_nombre: user?.nombre || 'Usuario',
        estado_anterior: visitaModal.estadoActual,
        estado_nuevo: visitaModal.nuevoEstado,
        notas: visitaNotas.trim() || null,
      });
      await updateCasa(visitaModal.id, { estado: visitaModal.nuevoEstado });
      toast.success('Visita registrada correctamente');
      setVisitaModal(null);
      setVisitaNotas('');
    } catch {
      toast.error('Error al registrar la visita');
    } finally {
      setSavingVisita(false);
    }
  };

  const statsRow = [
    { label: 'Atendidos', count: casas.filter(c => c.estado === 'Atendido').length, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    { label: 'Sin contacto', count: casas.filter(c => c.estado === 'No atendió').length, color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    { label: 'Pendientes', count: casas.filter(c => c.estado === 'Pendiente').length, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    { label: 'No tocar', count: casas.filter(c => c.estado === 'No tocar').length, color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
  ];

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Lista de Casas</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Registro de visitas y estados</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
          {filteredCasas.length} / {casas.length}
        </span>
      </div>

      {/* Stats mini-bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statsRow.map(s => (
          <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: s.color }}>{s.count}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card mb-4 p-4" style={{ borderLeft: '3px solid rgba(59,130,246,0.4)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#475569' }} />
            <input
              placeholder="Buscar dirección, contacto o zona..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <select value={filterTerritory} onChange={e => setFilterTerritory(e.target.value)}>
            <option value="Todos">Todos los territorios</option>
            {territorios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="Todos">Todos los estados</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tabla — desktop */}
      <div className="hidden md:block">
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest w-16" style={{ color: '#475569' }}>Foto</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Dirección</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Territorio</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Estado</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Contacto</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Especial</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-right" style={{ color: '#475569' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCasas.length > 0 ? filteredCasas.map(c => (
                <tr key={c.id} className="transition-colors duration-100" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td className="px-4 py-3" style={{ borderLeft: `3px solid ${getStatusColor(c.estado)}60` }}>
                    {c.foto_url ? (
                      <button onClick={() => setLightboxUrl(c.foto_url)} className="group relative w-10 h-10 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                        <img src={c.foto_url} alt="casa" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <ZoomIn size={13} className="text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.05)' }}>
                        <ImageOff size={14} style={{ color: '#94A3B8' }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: '#0F172A' }}>{c.direccion}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#64748B' }}>{c.territorio_nombre}</td>
                  <td className="px-4 py-3 text-sm">
                    {editStatusId === c.id ? (
                      <select
                        autoFocus
                        defaultValue={c.estado}
                        onBlur={() => setEditStatusId(null)}
                        onChange={e => {
                          setVisitaModal({ id: c.id, estadoActual: c.estado, nuevoEstado: e.target.value });
                          setVisitaNotas('');
                          setEditStatusId(null);
                        }}
                        className="text-xs py-1 px-2 rounded-lg w-auto"
                        style={{ border: '1px solid rgba(59,130,246,0.5)' }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditStatusId(c.id)}
                        className={`badge cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 ${getStatusBadge(c.estado)}`}
                        title="Clic para cambiar estado"
                      >
                        {c.estado} <ChevronDown size={10} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#64748B' }}>{c.nombre_contacto || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.tiene_caso_especial
                      ? <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>{c.tipo_caso || 'Especial'}</span>
                      : <span style={{ color: '#94A3B8' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="btn btn-danger py-1.5 px-3 text-xs flex items-center gap-1 ml-auto"
                    >
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-gray-400 text-sm">
                    No se encontraron casas con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-3">
        {filteredCasas.length > 0 ? filteredCasas.map(c => (
          <div key={c.id} className="card p-4" style={{ borderLeft: `3px solid ${getStatusColor(c.estado)}60` }}>
            <div className="flex items-start gap-3 mb-2">
              {c.foto_url ? (
                <button onClick={() => setLightboxUrl(c.foto_url)} className="w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                  <img src={c.foto_url} alt="casa" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,0,0,0.05)' }}>
                  <ImageOff size={16} style={{ color: '#94A3B8' }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: '#0F172A' }}>{c.direccion}</p>
                <p className="text-xs truncate" style={{ color: '#64748B' }}>{c.territorio_nombre}</p>
              </div>
              {editStatusId === c.id ? (
                <select
                  autoFocus
                  defaultValue={c.estado}
                  onBlur={() => setEditStatusId(null)}
                  onChange={e => {
                    setVisitaModal({ id: c.id, estadoActual: c.estado, nuevoEstado: e.target.value });
                    setVisitaNotas('');
                    setEditStatusId(null);
                  }}
                  className="text-xs py-1 px-1.5 rounded-lg shrink-0 w-auto"
                  style={{ border: '1px solid rgba(59,130,246,0.5)' }}
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setEditStatusId(c.id)}
                  className={`badge flex items-center gap-0.5 cursor-pointer hover:opacity-80 shrink-0 ${getStatusBadge(c.estado)}`}
                >
                  {c.estado} <ChevronDown size={10} />
                </button>
              )}
            </div>

            <div className="text-xs space-y-0.5 mb-3" style={{ color: '#64748B' }}>
              {c.nombre_contacto && <div>Contacto: {c.nombre_contacto}</div>}
              {c.tiene_caso_especial && <div className="font-semibold" style={{ color: '#F59E0B' }}>Caso especial: {c.tipo_caso || 'Sí'}</div>}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setDeleteTarget(c)} className="btn btn-danger py-1.5 px-3 text-xs flex items-center gap-1">
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          </div>
        )) : (
          <div className="card p-10 text-center text-sm" style={{ color: '#64748B' }}>
            No se encontraron casas con los filtros actuales.
          </div>
        )}
      </div>

      {/* Mini-modal Registrar Visita */}
      {visitaModal && (
        <ModalOverlay size="small" onClose={() => { setVisitaModal(null); setVisitaNotas(''); }}>
          <div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>Registrar Visita</h3>
            <p className="text-sm mb-4" style={{ color: '#475569' }}>
              Estado:{' '}
              <span className="font-semibold" style={{ color: getStatusColor(visitaModal.estadoActual) }}>{visitaModal.estadoActual}</span>
              {' → '}
              <span className="font-semibold" style={{ color: getStatusColor(visitaModal.nuevoEstado) }}>{visitaModal.nuevoEstado}</span>
            </p>
            <textarea
              rows={3}
              placeholder="Notas de la visita (opcional)..."
              value={visitaNotas}
              onChange={e => setVisitaNotas(e.target.value)}
              className="w-full resize-none"
              style={{ fontSize: '0.875rem' }}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                className="btn btn-outline"
                onClick={() => { setVisitaModal(null); setVisitaNotas(''); }}
                disabled={savingVisita}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleConfirmVisita}
                disabled={savingVisita}
              >
                {savingVisita && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                Registrar Visita
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar la casa "${deleteTarget.direccion}"?`}
          detail="Esta acción no se puede deshacer."
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Lightbox foto */}
      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative animate-scale-in" onClick={e => e.stopPropagation()}>
            <button
              className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                color: '#475569',
              }}
              onClick={() => setLightboxUrl(null)}
            >
              <X size={16} />
            </button>
            <img
              src={lightboxUrl}
              alt="Foto de la casa"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
              style={{ boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.5)' }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default HousesList;
