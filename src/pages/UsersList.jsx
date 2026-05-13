import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
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
  const [formData, setFormData] = useState({
    id: null, nombre: '', usuario: '', password: '',
    rol: 'Publicador', activo: true, foto_url: null,
  });

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_usuarios')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const openNew = () => {
    setFormData({ id: null, nombre: '', usuario: '', password: '', rol: 'Publicador', activo: true, foto_url: null });
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
        const { error } = await supabase.from('app_usuarios').insert([{
          nombre: formData.nombre, usuario: formData.usuario,
          password: formData.password, rol: formData.rol,
          activo: true, foto_url,
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

  if (user?.rol !== 'Admin Principal') {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <p className="text-red-500 font-bold mb-1">Acceso denegado</p>
          <p className="text-sm text-gray-400">Este módulo es exclusivo para Administradores.</p>
        </div>
      </div>
    );
  }

  const AvatarCell = ({ u }) => u.foto_url ? (
    <img src={u.foto_url} alt={u.nombre} className="w-9 h-9 rounded-full object-cover border-2 border-slate-200" />
  ) : (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white">
      {u.nombre?.charAt(0).toUpperCase() || '?'}
    </div>
  );

  const PasswordCell = ({ u }) => (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-600">
        {showPassId === u.id ? u.password : '••••••••'}
      </span>
      <button
        onClick={() => setShowPassId(showPassId === u.id ? null : u.id)}
        className="text-gray-300 hover:text-gray-500 transition-colors p-0.5"
        title={showPassId === u.id ? 'Ocultar' : 'Ver contraseña'}
      >
        {showPassId === u.id ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold m-0">Gestión de Usuarios</h1>
        <button className="btn btn-primary flex items-center gap-2" onClick={openNew}>
          <UserPlus size={15} /> Nuevo Usuario
        </button>
      </div>

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
                <tr className="border-b border-gray-100" style={{ backgroundColor: '#F8FAFC' }}>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Foto</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors duration-100">
                    <td className="px-4 py-3"><AvatarCell u={u} /></td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{u.nombre}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{u.usuario}</td>
                    <td className="px-4 py-3 text-sm"><PasswordCell u={u} /></td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${u.rol === 'Admin Principal' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${u.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
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
              <div key={u.id} className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <AvatarCell u={u} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">{u.nombre}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{u.usuario}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`badge text-xs ${u.rol === 'Admin Principal' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.rol}
                    </span>
                    <span className={`badge text-xs ${u.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
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
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in" style={{ borderRadius: '1.25rem' }}>
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
              <div className="form-group">
                <label className="form-label">Foto de Perfil</label>
                {(formData.foto_url || photoFile) && (
                  <div className="flex justify-center mb-3">
                    <img
                      src={photoFile ? URL.createObjectURL(photoFile) : formData.foto_url}
                      alt="Preview"
                      className="w-20 h-20 rounded-full object-cover border-4 border-blue-200"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setPhotoFile(e.target.files[0] || null)}
                  className="border-2 border-dashed border-gray-200 p-3 bg-gray-50 cursor-pointer w-full rounded-xl text-sm text-gray-500"
                />
              </div>
              {formData.id && (
                <div className="form-group">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-700">
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
          </div>
        </div>
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
