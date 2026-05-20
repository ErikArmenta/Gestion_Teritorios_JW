// SQL para crear primer Super Admin:
// UPDATE app_usuarios SET rol = 'Super Admin' WHERE usuario = 'TU_USUARIO_AQUI';

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import { Building2, Pencil, Trash2 } from 'lucide-react';

const CongregacionesList = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [congregaciones, setCongregaciones] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showModal, setShowModal]           = useState(false);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [formData, setFormData]             = useState({ id: null, nombre: '', clave: '' });

  const fetchCongregaciones = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('congregaciones')
      .select('id, nombre, clave, app_usuarios(count), territorios(count)')
      .order('nombre');
    if (!error) setCongregaciones(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCongregaciones(); }, []);


  const openNew = () => {
    setFormData({ id: null, nombre: '', clave: '' });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setFormData({ id: c.id, nombre: c.nombre, clave: c.clave || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('congregaciones')
          .update({ nombre: formData.nombre, clave: formData.clave || null })
          .eq('id', formData.id);
        if (error) throw error;
        toast.success('Congregación actualizada correctamente');
      } else {
        const { error } = await supabase
          .from('congregaciones')
          .insert([{ nombre: formData.nombre, clave: formData.clave || null }]);
        if (error) throw error;
        toast.success('Congregación creada correctamente');
      }
      setShowModal(false);
      fetchCongregaciones();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    const usuarios   = target.app_usuarios?.[0]?.count ?? 0;
    const territorios = target.territorios?.[0]?.count ?? 0;
    if (usuarios > 0 || territorios > 0) {
      toast.error(
        `No se puede eliminar: la congregación tiene ${usuarios} usuario(s) y ${territorios} territorio(s) asociados.`
      );
      return;
    }
    try {
      const { error } = await supabase.from('congregaciones').delete().eq('id', target.id);
      if (error) throw error;
      toast.success(`Congregación "${target.nombre}" eliminada`);
      fetchCongregaciones();
    } catch (err) {
      toast.error('Error al eliminar: ' + err.message);
    }
  };

  if (user?.rol !== 'Super Admin') {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <p className="text-red-500 font-bold mb-1">Acceso denegado</p>
          <p className="text-sm text-gray-400">Este módulo es exclusivo para Super Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Congregaciones</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Gestión global de congregaciones</p>
        </div>
        <button className="btn btn-primary flex items-center gap-2" onClick={openNew}>
          <Building2 size={15} /> Nueva Congregación
        </button>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <span className="text-xs font-bold tabular-nums" style={{ color: '#2563EB' }}>{congregaciones.length}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>total</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Tabla desktop */}
          <div className="hidden md:block card overflow-x-auto p-0">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Nombre</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Clave</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Usuarios</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Territorios</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-right" style={{ color: '#475569' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {congregaciones.map(c => (
                  <tr key={c.id} className="transition-colors duration-100" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: '#0F172A' }}>{c.nombre}</td>
                    <td className="px-4 py-3 text-sm font-mono" style={{ color: '#64748B' }}>{c.clave || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="badge text-xs" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563EB' }}>
                        {c.app_usuarios?.[0]?.count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge text-xs" style={{ background: 'rgba(100,116,139,0.1)', color: '#64748B' }}>
                        {c.territorios?.[0]?.count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(c)} className="btn btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="btn btn-danger py-1 px-2.5 text-xs flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-3">
            {congregaciones.map(c => (
              <div key={c.id} className="card p-4" style={{ borderLeft: '3px solid rgba(37,99,235,0.4)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: '#0F172A' }}>{c.nombre}</p>
                    {c.clave && (
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#64748B' }}>{c.clave}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3">
                    <span className="badge text-xs" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563EB' }}>
                      {c.app_usuarios?.[0]?.count ?? 0} usuarios
                    </span>
                    <span className="badge text-xs" style={{ background: 'rgba(100,116,139,0.1)', color: '#64748B' }}>
                      {c.territorios?.[0]?.count ?? 0} territorios
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(c)} className="btn btn-secondary py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1">
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="btn btn-danger py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)} size="small">
          <h3 className="mb-5 text-lg font-bold">{formData.id ? 'Editar Congregación' : 'Nueva Congregación'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input
                required
                value={formData.nombre}
                onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Congregación Norte"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Clave</label>
              <input
                value={formData.clave}
                onChange={e => setFormData(f => ({ ...f, clave: e.target.value }))}
                placeholder="Clave o código (opcional)"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline flex-1">Cancelar</button>
              <button type="submit" className="btn btn-primary flex-1">Guardar</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar congregación "${deleteTarget.nombre}"?`}
          detail="Esta acción no se puede deshacer. Solo es posible si no tiene usuarios ni territorios."
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default CongregacionesList;
