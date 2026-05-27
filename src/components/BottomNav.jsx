import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, Home, BarChart2, List, Users, Bell, MoreHorizontal, LogOut, User, X, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  { path: '/', name: 'Mapa', icon: <Map size={20} />, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
  { path: '/register', name: 'Registrar', icon: <Home size={20} />, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
  { path: '/stats', name: 'Stats', icon: <BarChart2 size={20} />, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/list', name: 'Lista', icon: <List size={20} />, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/users', name: 'Usuarios', icon: <Users size={20} />, roles: ['Super Admin', 'Admin Principal'] },
  { path: '/alerts', name: 'Alertas', icon: <Bell size={20} />, roles: ['Super Admin', 'Admin Principal'] },
  { path: '/congregaciones', name: 'Congregaciones', icon: <Building2 size={20} />, roles: ['Super Admin'] },
];

const BLUE = '#2563EB';
const BLUE_BG = 'rgba(37,99,235,0.08)';
const INACTIVE = '#94A3B8';

const NavItem = ({ item }) => (
  <NavLink
    to={item.path}
    end={item.path === '/'}
    className="relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors duration-200"
    style={({ isActive }) => ({
      color: isActive ? BLUE : INACTIVE,
      background: isActive ? BLUE_BG : 'transparent',
    })}
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 24,
              height: 3,
              borderRadius: '0 0 3px 3px',
              background: BLUE,
            }}
          />
        )}
        {item.icon}
        <span className="text-[10px] font-semibold leading-none">{item.name}</span>
      </>
    )}
  </NavLink>
);

const BottomNav = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  useEffect(() => {
    if (!expandedPhoto) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape') setExpandedPhoto(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [expandedPhoto]);

  if (!user) return null;

  const visibleMenu = menuItems.filter(item => item.roles.includes(user.rol));
  const showMore = visibleMenu.length > 4;
  const displayItems = showMore ? visibleMenu.slice(0, 4) : visibleMenu;

  const handleLogout = () => {
    setSheetOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-around items-center h-14"
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {displayItems.map(item => (
          <NavItem key={item.path} item={item} />
        ))}

        {showMore ? (
          /* "Más" button */
          <button
            onClick={() => setSheetOpen(true)}
            className="relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors duration-200"
            style={{ color: INACTIVE, background: 'transparent' }}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-semibold leading-none">Más</span>
          </button>
        ) : (
          /* LogOut as last item when <= 4 items */
          <button
            onClick={handleLogout}
            className="relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors duration-200"
            style={{ color: '#DC2626', background: 'transparent' }}
          >
            <LogOut size={20} />
            <span className="text-[10px] font-semibold leading-none">Salir</span>
          </button>
        )}
      </div>

      {/* Mini sheet — only when showMore */}
      {showMore && sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60] md:hidden"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
            onClick={() => setSheetOpen(false)}
          />

          {/* Sheet panel */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] md:hidden rounded-t-2xl"
            style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(0,0,0,0.15)' }} />
            </div>

            {/* Close button */}
            <button
              onClick={() => setSheetOpen(false)}
              className="absolute top-3 right-4 p-1.5 rounded-lg transition-colors"
              style={{ color: '#94A3B8' }}
            >
              <X size={18} />
            </button>

            {/* User info */}
            <div className="flex items-center gap-3 px-5 pt-3 pb-4">
              {user.foto_url ? (
                <img
                  src={user.foto_url}
                  alt={user.nombre}
                  className="w-12 h-12 rounded-full object-cover shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                  style={{ boxShadow: '0 0 0 2px rgba(37,99,235,0.35)' }}
                  onClick={() => setExpandedPhoto({ url: user.foto_url, nombre: user.nombre })}
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(37,99,235,0.1)' }}
                >
                  <User size={22} style={{ color: BLUE }} />
                </div>
              )}
              <div>
                <div className="text-sm font-bold" style={{ color: '#0F172A' }}>{user.nombre}</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: '#94A3B8' }}>{user.rol}</div>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px mb-3" style={{ background: 'rgba(0,0,0,0.07)' }} />

            {/* Extra menu items (5th, 6th…) */}
            {visibleMenu.slice(4).map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 px-5 py-3 transition-colors duration-150"
                style={({ isActive }) => ({
                  color: isActive ? BLUE : '#475569',
                  background: isActive ? BLUE_BG : 'transparent',
                })}
              >
                {item.icon}
                <span className="text-sm font-semibold">{item.name}</span>
              </NavLink>
            ))}

            {/* Divider before logout */}
            <div className="mx-5 h-px my-3" style={{ background: 'rgba(0,0,0,0.07)' }} />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 mx-auto px-5 py-3 mb-4 rounded-xl text-sm font-semibold transition-colors duration-200"
              style={{
                width: 'calc(100% - 40px)',
                color: '#DC2626',
                background: 'rgba(220,38,38,0.07)',
                border: '1px solid rgba(220,38,38,0.15)',
              }}
            >
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        </>
      )}

      {/* Modal foto de perfil expandida */}
      {expandedPhoto && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setExpandedPhoto(null)}
        >
          <div
            className="relative animate-scale-in flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                color: '#475569',
              }}
              onClick={() => setExpandedPhoto(null)}
            >
              <X size={16} />
            </button>
            <img
              src={expandedPhoto.url}
              alt={expandedPhoto.nombre}
              className="w-56 h-56 sm:w-72 sm:h-72 rounded-full object-cover"
              style={{
                boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.5)',
                border: '4px solid rgba(255,255,255,0.2)',
              }}
            />
            <p
              className="mt-4 text-lg font-bold text-center"
              style={{ color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              {expandedPhoto.nombre}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default BottomNav;
