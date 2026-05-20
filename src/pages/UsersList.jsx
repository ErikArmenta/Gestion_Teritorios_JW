import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import { ROLES } from '../utils/constants';
import { Eye, EyeOff, Pencil, Trash2, UserPlus } from 'lucide-react';

const UsersList = () => {
  const { user } = useAuth();
  const { uploadPhoto } = useData();
  const toast = useToast();

  const [usuarios, setUsuarios]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [photoFile, setPhotoFile]   = useState(null);
  const [showPassId, setShowPassId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const [congregaciones, setCongregaciones] = useState([]);
  const [formData, setFormData] = useState({
    id: null, nombre: '', usuario: '', password: '',
    rol: 'Publicador', activo: true, foto_url: null, congregacion_id: '',
  });

  const fetchUsuarios = async () => {
    setLoading(true);
    let query;
    if (user?.rol === 'Super Admin') {
      query = supabase.from('app_usuarios').select('*, congregaciones(nombre)');
    } else {
      query = supabase.from('app_usuarios').select('*');
      if (user?.congregacion_id) query = query.eq('congregacion_id', user.congregacion_id);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error) setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  useEffect(() => {
    if (user?.rol !== 'Super Admin') return;
    supabase.from('congregaciones').select('id, nombre').order('nombre')
      .then(({ data }) => setCongregaciones(data || []));
  }, [user]);

  const openNew = () => {
    setFormData({ id: null, nombre: '', usuario: '', password: '', rol: 'Publicador', activo: true, foto_url: null, congregacion_id: '' });
    setPhotoFile(null);
    setShowModal(true);
  };

  const openEdit = (u) => {
    setFormData(u);
    setPhotoFile(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let foto_url = formData.foto_url;
      if (photoFile) foto_url = await uploadPhoto(photoFile);

      if (formData.id) {
        const { error } = await supabase.from('app_usuarios').update({
          nombre: formData.nombre, usuario: formData.usuario,
          password: formData.password, rol: formData.rol,
          activo: formData.activo, foto_url,
        }).eq('id', formData.id);
        if (error) throw error;
        toast.success('Usuario actualizado correctamente');
      } else {
        const congId = user.rol === 'Super Admin'
          ? (formData.congregacion_id || null)
          : (user.congregacion_id || null);
        const { error } = await supabase.from('app_usuarios').insert([{
          nombre: formData.nombre, usuario: formData.usuario,
          password: formData.password, rol: formData.rol,
          activo: true, foto_url,
          congregacion_id: congId,
        }]);
        if (error) throw error;
        toast.success('Usuario creado correctamente');
      }

      setShowModal(false);
      setPhotoFile(null);
      fetchUsuarios();
    } catch (err) {
      toast.error(err.message?.includes('unique') ? 'El nombre de usuario ya existe.' : ('Error: ' + err.message));
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('app_usuarios').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success(`Usuario "${deleteTarget.nombre}" eliminado`);
      fetchUsuarios();
    } catch (err) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  if (user?.rol !== 'Admin Principal' && user?.rol !== 'Super Admin') {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <p className="text-red-500 font-bold mb-1">Acceso denegado</p>
          <p className="text-sm text-gray-400">Este módulo es exclusivo para Administradores.</p>
        </div>
      </div>
    );
  }

  const AvatarCell = ({ u }) => (
    <div className="relative w-10 h-10">
      {u.foto_url ? (
        <img src={u.foto_url} alt={u.nombre} className="w-10 h-10 rounded-full object-cover" style={{ border: '2px solid rgba(0,0,0,0.1)' }} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-sm font-bold text-white">
          {u.nombre?.charAt(0).toUpperCase() || '?'}
        </div>
      )}
      <span
        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
        style={{ background: u.activo ? '#10B981' : '#EF4444', borderColor: '#FFFFFF' }}
      />
    </div>
  );

  const PasswordCell = ({ u }) => (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>
        {showPassId === u.id ? u.password : '••••••••'}
      </span>
      <button
        onClick={() => setShowPassId(showPassId === u.id ? null : u.id)}
        className="transition-colors p-0.5"
        style={{ color: '#475569' }}
        title={showPassId === u.id ? 'Ocultar' : 'Ver contraseña'}
      >
        {showPassId === u.id ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );

  const activeCount = usuarios.filter(u => u.activo).length;
  const inactiveCount = usuarios.filter(u => !u.activo).length;

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Gestión de Usuarios</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Administración de cuentas del sistema</p>
        </div>
        <button className="btn btn-primary flex items-center gap-2" onClick={openNew}>
          <UserPlus size={15} /> Nuevo Usuario
        </button>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <span className="text-xs font-bold tabular-nums" style={{ color: '#2563EB' }}>{usuarios.length}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>total</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#10B981' }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: '#059669' }}>{activeCount}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>activos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#EF4444' }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: '#DC2626' }}>{inactiveCount}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>inactivos</span>
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
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Foto</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Nombre</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Usuario</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Contraseña</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Rol</th>
                  {user?.rol === 'Super Admin' && (
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Congregación</th>
                  )}
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Estado</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-right" style={{ color: '#475569' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} className="transition-colors duration-100" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-4 py-3"><AvatarCell u={u} /></td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: '#0F172A' }}>{u.nombre}</td>
                    <td className="px-4 py-3 text-sm font-mono" style={{ color: '#64748B' }}>{u.usuario}</td>
                    <td className="px-4 py-3 text-sm"><PasswordCell u={u} /></td>
                    <td className="px-4 py-3">
                      <span className="badge text-xs" style={u.rol === 'Admin Principal'
                        ? { background: 'rgba(37,99,235,0.1)', color: '#2563EB' }
                        : { background: 'rgba(100,116,139,0.1)', color: '#64748B' }}>
                        {u.rol}
                      </span>
                    </td>
                    {user?.rol === 'Super Admin' && (
                      <td className="px-4 py-3">
                        <span className="badge text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#2563EB' }}>
                          {u.congregaciones?.nombre || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="badge text-xs" style={u.activo
                        ? { background: 'rgba(5,150,105,0.1)', color: '#059669' }
                        : { background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(u)} className="btn btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.id === user.id}
                          className="btn btn-danger py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-30"
                          title={u.id === user.id ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'}
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
            {usuarios.map(u => (
              <div key={u.id} className="card p-4" style={{ borderLeft: `3px solid ${u.activo ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.35)'}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <AvatarCell u={u} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: '#0F172A' }}>{u.nombre}</p>
                    <p className="text-xs font-mono truncate" style={{ color: '#64748B' }}>{u.usuario}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="badge text-xs" style={u.rol === 'Admin Principal'
                      ? { background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }
                      : { background: 'rgba(100,116,139,0.12)', color: '#94A3B8' }}>
                      {u.rol}
                    </span>
                    {user?.rol === 'Super Admin' && (
                      <span className="badge text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#2563EB' }}>
                        {u.congregaciones?.nombre || '-'}
                      </span>
                    )}
                    <span className="badge text-xs" style={u.activo
                      ? { background: 'rgba(16,185,129,0.15)', color: '#34D399' }
                      : { background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                <div className="mb-3">
                  <PasswordCell u={u} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(u)} className="btn btn-secondary py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1">
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    disabled={u.id === user.id}
                    className="btn btn-danger py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1 disabled:opacity-30"
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
        <ModalOverlay onClose={() => setShowModal(false)} maxWidth="max-w-md">
          <h3 className="mb-5 text-lg font-bold">{formData.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input required value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Juan Pérez" />
            </div>
            <div className="form-group">
              <label className="form-label">Usuario de Acceso *</label>
              <input required value={formData.usuario} onChange={e => setFormData(f => ({ ...f, usuario: e.target.value }))} placeholder="Para iniciar sesión" />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña *</label>
              <input required value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} type="text" placeholder="Contraseña de acceso" />
            </div>
            <div className="form-group">
              <label className="form-label">Rol del Sistema *</label>
              <select value={formData.rol} onChange={e => setFormData(f => ({ ...f, rol: e.target.value }))}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {user?.rol === 'Super Admin' && (
              <div className="form-group">
                <label className="form-label">Congregación *</label>
                <select required value={formData.congregacion_id} onChange={e => setFormData(f => ({ ...f, congregacion_id: e.target.value }))}>
                  <option value="">Seleccionar congregación...</option>
                  {congregaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Foto de Perfil</label>
              {(formData.foto_url || photoFile) && (
                <div className="flex justify-center mb-3">
                  <img
                    src={photoPreview || formData.foto_url}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover"
                    style={{ border: '3px solid rgba(59,130,246,0.4)' }}
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={e => setPhotoFile(e.target.files[0] || null)}
                className="cursor-pointer w-full rounded-xl text-xs"
                style={{ border: '2px dashed rgba(0,0,0,0.12)', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', color: '#64748B' }}
              />
            </div>
            {formData.id && (
              <div className="form-group flex justify-center">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium" style={{ color: '#64748B' }}>
                  <input
                    type="checkbox"
                    className="w-auto accent-blue-500"
                    checked={formData.activo}
                    onChange={e => setFormData(f => ({ ...f, activo: e.target.checked }))}
                  />
                  Permitir acceso al sistema (Activo)
                </label>
              </div>
            )}
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
          message={`¿Eliminar al usuario "${deleteTarget.nombre}"?`}
          detail="Esta acción no se puede deshacer."
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default UsersList;
