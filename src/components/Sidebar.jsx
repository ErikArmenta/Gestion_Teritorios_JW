import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, Home, BarChart2, List, Users, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/', name: 'Mapa Principal', icon: <Map size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/register', name: 'Registrar Casa', icon: <Home size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/stats', name: 'Estadísticas', icon: <BarChart2 size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/list', name: 'Lista de Casas', icon: <List size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/users', name: 'Usuarios', icon: <Users size={20} />, roles: ['Admin Principal'] },
  ];

  const visibleMenu = menuItems.filter(item => item.roles.includes(user.rol));

  return (
    <div style={{
      width: '260px',
      backgroundColor: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.5rem',
      height: '100vh',
      position: 'sticky',
      top: 0
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2.5rem', gap: '1rem' }}>
        <img src="/JW.jpg" alt="JW Logo" style={{ width: '140px', height: '140px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0, textAlign: 'center', fontWeight: 600 }}>
          Gestión Territorial
        </h2>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        {visibleMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              color: isActive ? 'var(--primary-color)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              fontWeight: isActive ? 600 : 500,
              transition: 'all 0.2s'
            })}
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem' }}>
          {user.foto_url ? (
            <img src={user.foto_url} alt={user.nombre} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
          ) : (
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={20} />
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.nombre}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user.rol}</div>
          </div>
        </div>
        
        <button onClick={handleLogout} className="btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
