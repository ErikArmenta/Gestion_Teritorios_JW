import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, Home, BarChart2, List, Users, Bell, LogOut, User } from 'lucide-react';
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
    { path: '/', name: 'Mapa Principal', icon: <Map size={18} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/register', name: 'Registrar Casa', icon: <Home size={18} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/stats', name: 'Estadísticas', icon: <BarChart2 size={18} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/list', name: 'Lista de Casas', icon: <List size={18} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/users', name: 'Usuarios', icon: <Users size={18} />, roles: ['Admin Principal'] },
    { path: '/alerts', name: 'Alertas', icon: <Bell size={18} />, roles: ['Admin Principal'] },
  ];

  const visibleMenu = menuItems.filter(item => item.roles.includes(user.rol));

  const SidebarContent = ({ onNavClick }) => (
    <div className="flex flex-col h-full">
      {/* Logo section */}
      <div className="flex flex-col items-center pt-8 pb-5 px-4">
        <div
          className="w-24 h-24 rounded-2xl overflow-hidden mb-3"
          style={{ boxShadow: '0 0 0 3px rgba(37,99,235,0.2), 0 4px 16px rgba(37,99,235,0.15)' }}
        >
          <img src="/JW.jpg" alt="JW Logo" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-base font-bold text-center leading-snug tracking-tight" style={{ color: '#0F172A' }}>
          Gestión Territorial
        </h2>
        <span className="text-xs font-medium mt-0.5" style={{ color: '#94A3B8' }}>JW</span>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px mb-3" style={{ background: 'rgba(0,0,0,0.07)' }} />

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5 flex-1 px-3">
        {visibleMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavClick}
            className={({ isActive }) =>
              `sidebar-nav-item${isActive ? ' active' : ''}`
            }
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-3 pb-6 pt-3">
        <div className="h-px mb-4" style={{ background: 'rgba(0,0,0,0.07)' }} />
        <div className="flex items-center gap-3 px-2 mb-3">
          {user.foto_url ? (
            <img
              src={user.foto_url}
              alt={user.nombre}
              className="w-9 h-9 rounded-full object-cover shrink-0"
              style={{ boxShadow: '0 0 0 2px rgba(37,99,235,0.35)' }}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <User size={16} className="text-white" />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{user.nombre}</div>
            <div className="text-xs truncate" style={{ color: '#94A3B8' }}>{user.rol}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
          style={{
            color: '#DC2626',
            background: 'rgba(220,38,38,0.07)',
            border: '1px solid rgba(220,38,38,0.15)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.07)'}
        >
          <LogOut size={15} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar desktop */}
      <div
        className="hidden md:flex md:flex-col md:w-64 md:sticky md:top-0 md:h-screen shrink-0"
        style={{
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <SidebarContent onNavClick={() => {}} />
      </div>
    </>
  );
};

export default Sidebar;
