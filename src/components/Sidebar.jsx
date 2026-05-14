import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, Home, BarChart2, List, Users, Bell, LogOut, User, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setIsOpen(false);
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
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg mb-3" style={{ boxShadow: '0 0 0 2px rgba(59,130,246,0.45), 0 4px 16px rgba(0,0,0,0.4)' }}>
          <img src="/JW.jpg" alt="JW Logo" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-sm font-bold text-white/90 text-center leading-snug tracking-tight">
          Gestión Territorial
        </h2>
        <span className="text-xs text-white/35 mt-0.5 font-medium">JW</span>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-white/10 mb-3" />

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
        <div className="h-px bg-white/10 mb-4" />
        <div className="flex items-center gap-3 px-2 mb-3">
          {user.foto_url ? (
            <img
              src={user.foto_url}
              alt={user.nombre}
              className="w-9 h-9 rounded-full object-cover shrink-0"
              style={{ boxShadow: '0 0 0 2px rgba(59,130,246,0.5)' }}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <User size={16} className="text-white" />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-semibold text-white/90 truncate">{user.nombre}</div>
            <div className="text-xs text-white/40 truncate">{user.rol}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors duration-200 border border-red-500/15"
        >
          <LogOut size={15} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Botón hamburger — solo móvil, visible cuando el sidebar está cerrado */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-white/80 backdrop-blur shadow-sm border border-gray-200"
          aria-label="Abrir menú"
        >
          <Menu size={18} className="text-gray-700" />
        </button>
      )}

      {/* Drawer móvil */}
      <div
        className="fixed inset-y-0 left-0 z-40 w-64 flex flex-col md:hidden transition-transform duration-300 ease-out"
        style={{
          backgroundColor: '#0F172A',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Botón X dentro del sidebar */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-3 right-3 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
        <SidebarContent onNavClick={handleNavClick} />
      </div>

      {/* Sidebar desktop */}
      <div
        className="hidden md:flex md:flex-col md:w-64 md:sticky md:top-0 md:h-screen shrink-0"
        style={{ backgroundColor: '#0F172A', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <SidebarContent onNavClick={() => {}} />
      </div>
    </>
  );
};

export default Sidebar;
