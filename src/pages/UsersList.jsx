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
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Acceso denegado. Módulo exclusivo para Administradores.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Gestión de Usuarios</h1>
        <button className="btn btn-primary" onClick={() => { 
          setFormData({ id: null, nombre: '', usuario: '', password: '', rol: 'Publicador', activo: true, foto_url: null });
          setPhotoFile(null);
          setShowModal(true);
        }}>
          + Nuevo Usuario
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Foto</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Nombre</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Usuario</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Contraseña</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Rol</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Estado</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem' }}>
                  {u.foto_url ? (
                    <img src={u.foto_url} alt={u.nombre} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-color)' }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#6B7280' }}>
                      {u.nombre ? u.nombre.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{u.nombre}</td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}><strong>{u.usuario}</strong></td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>{u.password}</td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <span className="badge" style={{ backgroundColor: u.rol === 'Admin Principal' ? '#EFF6FF' : '#F3F4F6', color: u.rol === 'Admin Principal' ? '#1E40AF' : '#374151' }}>
                    {u.rol}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <span className="badge" style={{ backgroundColor: u.activo ? '#ECFDF5' : '#FEF2F2', color: u.activo ? '#065F46' : '#991B1B' }}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>
                  <button onClick={() => { setFormData(u); setPhotoFile(null); setShowModal(true); }} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }}>Editar</button>
                  <button onClick={() => handleDelete(u.id)} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '1rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>{formData.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
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
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                    <img 
                      src={photoFile ? URL.createObjectURL(photoFile) : formData.foto_url} 
                      alt="Preview" 
                      style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)' }} 
                    />
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setPhotoFile(e.target.files[0])}
                  style={{ border: '2px dashed var(--border-color)', padding: '0.75rem', backgroundColor: '#f9fafb', cursor: 'pointer' }}
                />
              </div>

              {formData.id && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={formData.activo} onChange={e => setFormData({...formData, activo: e.target.checked})} />
                    Permitir acceso al sistema (Activo)
                  </label>
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersList;
