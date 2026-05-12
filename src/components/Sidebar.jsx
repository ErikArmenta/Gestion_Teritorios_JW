import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, Home, BarChart2, List, Users, LogOut, User, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setIsOpen(false);
  };

  const menuItems = [
    { path: '/', name: 'Mapa Principal', icon: <Map size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/register', name: 'Registrar Casa', icon: <Home size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
    { path: '/stats', name: 'Estadísticas', icon: <BarChart2 size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/list', name: 'Lista de Casas', icon: <List size={20} />, roles: ['Admin Principal', 'Anciano', 'Ministerial'] },
    { path: '/users', name: 'Usuarios', icon: <Users size={20} />, roles: ['Admin Principal'] },
  ];

  const visibleMenu = menuItems.filter(item => item.roles.includes(user.rol));

  const SidebarContent = ({ onNavClick }) => (
    <>
      {/* Logo + título */}
      <div className="flex flex-col items-center mb-6 gap-4">
        <img
          src="/JW.jpg"
          alt="JW Logo"
          className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl object-cover shadow-md"
        />
        <h2 className="text-xl font-semibold text-gray-900 text-center m-0">
          Gestión Territorial
        </h2>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-2 flex-1">
        {visibleMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavClick}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 rounded-lg no-underline font-semibold text-blue-500 bg-blue-50'
                : 'flex items-center gap-3 px-4 py-3 rounded-lg no-underline font-medium text-gray-500 bg-transparent hover:bg-gray-50 transition-colors duration-200'
            }
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="mt-auto pt-4 border-t border-gray-200 flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2">
          {user.foto_url ? (
            <img
              src={user.foto_url}
              alt={user.nombre}
              className="w-10 h-10 rounded-full object-cover border-2 border-blue-500 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-semibold text-gray-900 truncate">{user.nombre}</div>
            <div className="text-xs text-gray-500">{user.rol}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-800 border border-red-300 btn"
        >
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Botón hamburger — solo móvil */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 bg-white rounded-lg shadow-md border border-gray-200"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      {/* Overlay — solo móvil, visible cuando isOpen */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer móvil */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col p-6 transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Botón cerrar */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>

        <SidebarContent onNavClick={handleNavClick} />
      </div>

      {/* Sidebar desktop */}
      <div className="hidden md:flex md:flex-col md:w-64 md:sticky md:top-0 md:h-screen bg-white border-r border-gray-200 p-6 shrink-0">
        <SidebarContent onNavClick={() => {}} />
      </div>
    </>
  );
};

export default Sidebar;
