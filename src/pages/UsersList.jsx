import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const UsersList = () => {
  const { user } = useAuth();
  const { uploadPhoto } = useData();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [formData, setFormData] = useState({ id: null, nombre: '', usuario: '', password: '', rol: 'Publicador', activo: true, foto_url: null });

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('app_usuarios').select('*').order('created_at', { ascending: false });
    if (!error) setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let fotoUrl = formData.foto_url;
      if (photoFile) {
        fotoUrl = await uploadPhoto(photoFile);
      }

      if (formData.id) {
        const { error } = await supabase.from('app_usuarios').update({
          nombre: formData.nombre,
          usuario: formData.usuario,
          password: formData.password,
          rol: formData.rol,
          activo: formData.activo,
          foto_url: fotoUrl
        }).eq('id', formData.id);

        if (error) alert("Error al actualizar");
        else { setShowModal(false); setPhotoFile(null); fetchUsuarios(); }
      } else {
        const { error } = await supabase.from('app_usuarios').insert([{
          nombre: formData.nombre,
          usuario: formData.usuario,
          password: formData.password,
          rol: formData.rol,
          activo: true,
          foto_url: fotoUrl
        }]);

        if (error) alert("Error al crear usuario. Tal vez el nombre de usuario ya existe.");
        else { setShowModal(false); setPhotoFile(null); fetchUsuarios(); }
      }
    } catch(err) {
      alert("Error: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm("¿Estás seguro de eliminar permanentemente a este usuario?")) {
      await supabase.from('app_usuarios').delete().eq('id', id);
      fetchUsuarios();
    }
  };

  if (user?.rol !== 'Admin Principal') {
    return <div className="p-8 text-center text-red-500">Acceso denegado. Módulo exclusivo para Administradores.</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold m-0">Gestión de Usuarios</h1>
        <button className="btn btn-primary" onClick={() => {
          setFormData({ id: null, nombre: '', usuario: '', password: '', rol: 'Publicador', activo: true, foto_url: null });
          setPhotoFile(null);
          setShowModal(true);
        }}>
          + Nuevo Usuario
        </button>
      </div>

      {/* Tabla — solo desktop */}
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-sm font-semibold">Foto</th>
              <th className="px-4 py-3 text-sm font-semibold">Nombre</th>
              <th className="px-4 py-3 text-sm font-semibold">Usuario</th>
              <th className="px-4 py-3 text-sm font-semibold">Contraseña</th>
              <th className="px-4 py-3 text-sm font-semibold">Rol</th>
              <th className="px-4 py-3 text-sm font-semibold">Estado</th>
              <th className="px-4 py-3 text-sm font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} className="border-b border-gray-200">
                <td className="px-4 py-3">
                  {u.foto_url ? (
                    <img src={u.foto_url} alt={u.nombre} className="w-9 h-9 rounded-full object-cover border-2 border-gray-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-500">
                      {u.nombre ? u.nombre.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">{u.nombre}</td>
                <td className="px-4 py-3 text-sm"><strong>{u.usuario}</strong></td>
                <td className="px-4 py-3 text-sm font-mono">{u.password}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`badge ${u.rol === 'Admin Principal' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`badge ${u.activo ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <button onClick={() => { setFormData(u); setPhotoFile(null); setShowModal(true); }} className="btn btn-secondary py-1 px-2 text-xs mr-2">Editar</button>
                  <button onClick={() => handleDelete(u.id)} className="btn btn-danger py-1 px-2 text-xs">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — solo móvil */}
      <div className="md:hidden space-y-3">
        {usuarios.map(u => (
          <div key={u.id} className="card p-4">
            {/* Fila superior: avatar + info */}
            <div className="flex items-center gap-3 mb-3">
              {u.foto_url ? (
                <img src={u.foto_url} alt={u.nombre} className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-500 flex-shrink-0">
                  {u.nombre ? u.nombre.charAt(0).toUpperCase() : '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{u.nombre}</p>
                <p className="text-xs text-gray-500 truncate"><strong>{u.usuario}</strong></p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`badge text-xs ${u.rol === 'Admin Principal' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                  {u.rol}
                </span>
                <span className={`badge text-xs ${u.activo ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>

            {/* Contraseña */}
            <p className="text-xs text-gray-400 font-mono mb-3">Pass: {u.password}</p>

            {/* Fila inferior: botones */}
            <div className="flex gap-2">
              <button onClick={() => { setFormData(u); setPhotoFile(null); setShowModal(true); }} className="btn btn-secondary py-1 px-3 text-xs flex-1">Editar</button>
              <button onClick={() => handleDelete(u.id)} className="btn btn-danger py-1 px-3 text-xs flex-1">Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="mb-6 text-lg font-semibold">{formData.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej. Juan Pérez" />
              </div>
              <div className="form-group">
                <label className="form-label">Usuario de Acceso</label>
                <input required value={formData.usuario} onChange={e => setFormData({...formData, usuario: e.target.value})} placeholder="Para iniciar sesión" />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="text" />
              </div>
              <div className="form-group">
                <label className="form-label">Rol del Sistema</label>
                <select value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})}>
                  <option value="Publicador">Publicador (Solo registrar casas)</option>
                  <option value="Ministerial">Ministerial (Acceso Operativo)</option>
                  <option value="Anciano">Anciano (Acceso Operativo)</option>
                  <option value="Admin Principal">Admin Principal (Acceso Total)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Foto de Perfil</label>
                {(formData.foto_url || photoFile) && (
                  <div className="flex justify-center mb-2">
                    <img
                      src={photoFile ? URL.createObjectURL(photoFile) : formData.foto_url}
                      alt="Preview"
                      className="w-20 h-20 rounded-full object-cover border-4 border-blue-500"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files[0])}
                  className="border-2 border-dashed border-gray-200 p-3 bg-gray-50 cursor-pointer w-full rounded-lg"
                />
              </div>

              {formData.id && (
                <div className="form-group">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-auto" checked={formData.activo} onChange={e => setFormData({...formData, activo: e.target.checked})} />
                    Permitir acceso al sistema (Activo)
                  </label>
                </div>
              )}

              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersList;
