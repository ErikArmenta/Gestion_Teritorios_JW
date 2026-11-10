import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { GripHorizontal, Sun, Moon, Languages, User, LogOut, PanelLeftClose, PanelLeftOpen, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useMapaFondo } from '../context/MapaFondoContext';
import { menuDe, NEON_ROL } from '../utils/menu';
import ConfirmarCerrarSesion from './ConfirmarCerrarSesion';
import NotificacionesToggle from './NotificacionesToggle';
import { t, useLanguage } from '../i18n';

// Menú flotante de escritorio, en todas las pantallas (reemplaza a la barra lateral).
// Izquierda: iconos de navegación (misma lista que la Sidebar: utils/menu.js), tema, idioma, perfil,
// salir y ocultar. Derecha: el panel de la pantalla (cada pantalla lo manda con components/PanelMapa.jsx).
// Se arrastra desde el encabezado, recuerda su posición y con CLIC DERECHO regresa a su lugar.
const POS_KEY = 'menu_flotante_pos';
const POS_INICIAL = { x: 16, y: 16 };
const MARGEN = 8;

const leerPos = () => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY));
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : POS_INICIAL;
  } catch { return POS_INICIAL; }
};
const guardarPos = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* sin storage */ } };

// Siempre queda a la vista al menos la columna de iconos y el encabezado
const limitar = (p) => ({
  x: Math.min(Math.max(MARGEN, p.x), Math.max(MARGEN, window.innerWidth - 120)),
  y: Math.min(Math.max(MARGEN, p.y), Math.max(MARGEN, window.innerHeight - 80)),
});

const esCampoDeTexto =(el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"]');

// En las pantallas sin mapa el panel se puede colapsar (queda solo la columna de iconos) y se recuerda
const OCULTO_KEY = 'menu_flotante_oculto';
const leerOculto = () => { try { return localStorage.getItem(OCULTO_KEY) === '1'; } catch { return false; } };
const guardarOculto = (v) => { try { localStorage.setItem(OCULTO_KEY, v ? '1' : '0'); } catch { /* sin storage */ } };

// enMapa: pantalla con el mapa de fondo (el panel lo llena la pantalla con PanelMapa).
// Sin mapa: el panel trae accesos con nombre, la congregación y las notificaciones.
const MenuFlotante = ({ enMapa = true }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLanguage();
  const { setSlotPanel } = useMapaFondo();

  const [pos, setPos] = useState(() => limitar(leerPos()));
  const [ocultoMapa, setOcultoMapa] = useState(false);
  const [ocultoPagina, setOcultoPagina] = useState(leerOculto);
  const oculto = enMapa ? ocultoMapa : ocultoPagina;
  const setOculto = (v) => {
    if (enMapa) { setOcultoMapa(v); return; }
    setOcultoPagina(v);
    guardarOculto(v);
  };
  const [confirmarSalir, setConfirmarSalir] = useState(false); // "¿Cerrar sesión?"
  const arrastreRef = useRef(null);

  const slotRef = useCallback((el) => setSlotPanel(el), [setSlotPanel]);
  useEffect(() => () => setSlotPanel(null), [setSlotPanel]);

  // Si la ventana se achica, que no se salga
  useEffect(() => {
    const onResize = () => setPos(p => limitar(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const empezarArrastre = (e) => {
    if (e.button !== 0 || e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    arrastreRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moverArrastre = (e) => {
    if (!arrastreRef.current) return;
    setPos(limitar({ x: e.clientX - arrastreRef.current.dx, y: e.clientY - arrastreRef.current.dy }));
  };
  const terminarArrastre = () => {
    if (!arrastreRef.current) return;
    arrastreRef.current = null;
    setPos(p => { guardarPos(p); return p; });
  };

  // Clic derecho sobre el menú (fuera de cajas de texto) → regresa a su lugar y se muestra
  const regresar = (e) => {
    if (esCampoDeTexto(e.target)) return;
    e.preventDefault();
    setPos(POS_INICIAL);
    guardarPos(POS_INICIAL);
    setOculto(false);
  };

  if (!user) return null;

  const salir = () => setConfirmarSalir(true);

  return (
    <div
      className={`m3d-menu${oculto ? ' is-oculto' : ''}`}
      style={{ left: pos.x, top: pos.y, maxHeight: `calc(100dvh - ${pos.y + MARGEN}px)` }}
      onContextMenu={regresar}
    >
      {/* Columna de iconos */}
      <nav
        className="m3d-menu__riel"
        aria-label={t('Menú')}
        onPointerDown={empezarArrastre}
        onPointerMove={moverArrastre}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
      >
        <img src="/jw-logo.png" alt="" className="m3d-menu__logo" draggable={false} />
        {menuDe(user.rol).map(({ path, name, Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => `m3d-menu__item${isActive ? ' is-active' : ''}`}
            title={t(name)}
            aria-label={t(name)}
          >
            <Icon size={18} />
            <span className="m3d-menu__etq">{t(name)}</span>
          </NavLink>
        ))}
        <span className="flex-1" />
        <button type="button" className="m3d-menu__item" onClick={toggleTheme} title={theme === 'dark' ? t('Modo claro') : t('Modo oscuro')} aria-label={theme === 'dark' ? t('Modo claro') : t('Modo oscuro')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="m3d-menu__item m3d-menu__item--txt" onClick={toggleLang} title={lang === 'es' ? 'English' : 'Español'} aria-label={lang === 'es' ? 'English' : 'Español'}>
          <Languages size={18} />
          <span className="m3d-menu__etq">{lang === 'es' ? 'EN' : 'ES'}</span>
        </button>
        <NavLink to="/profile" className="m3d-menu__item" title={t('Mi Perfil')} aria-label={t('Mi Perfil')}>
          {user.foto_url ? <img src={user.foto_url} alt="" className="m3d-menu__avatar" /> : <User size={18} />}
        </NavLink>
        <button type="button" className="m3d-menu__item m3d-menu__item--salir" onClick={salir} title={t('Salir')} aria-label={t('Salir')}>
          <LogOut size={18} />
        </button>
        <button
          type="button"
          className="m3d-menu__item m3d-menu__ocultar"
          onClick={() => setOculto(!oculto)}
          title={oculto ? t('Mostrar panel') : t('Ocultar panel')}
          aria-label={oculto ? t('Mostrar panel') : t('Ocultar panel')}
        >
          {oculto ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </nav>

      {/* Panel de la pantalla (se oculta, pero sigue montado: las pantallas mandan su contenido aquí) */}
      <div className="m3d-menu__panel">
        <div
          className="m3d-menu__barra"
          onPointerDown={empezarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          title={t('Arrastra para mover · clic derecho para regresar')}
        >
          <GripHorizontal size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <div className="m3d-menu__quien" style={{ '--neon': NEON_ROL[user.rol] || NEON_ROL.Publicador }}>
            <span className="m3d-menu__titulo">{t('Gestión Territorial')}</span>
            <span className="m3d-menu__nombre" title={user.nombre}>{user.nombre}</span>
          </div>
          {/* Rol y, debajo, la congregación (arriba, a la vista en todas las pantallas) */}
          {(user.rol || user.congregacion_nombre) && (
            <div className="m3d-menu__etiquetas">
              {user.rol && <span className="m3d-menu__rol" style={{ '--neon': NEON_ROL[user.rol] || NEON_ROL.Publicador }}>{t(user.rol)}</span>}
              {user.congregacion_nombre && (
                <span className="m3d-menu__congre m3d-menu__congre--barra" title={user.congregacion_nombre}>
                  <Building2 size={12} className="shrink-0" />
                  <span className="truncate">{user.congregacion_nombre}</span>
                </span>
              )}
            </div>
          )}
        </div>
        {!enMapa && (
          <div className="m3d-menu__slot">
            <nav className="m3d-menu__accesos" aria-label={t('Menú')}>
              {menuDe(user.rol).map(({ path, name, Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  className={({ isActive }) => `m3d-menu__acceso${isActive ? ' is-active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{t(name)}</span>
                </NavLink>
              ))}
            </nav>
            <NotificacionesToggle className="m3d-menu__notif" />
          </div>
        )}
        {/* Pantallas con mapa: aquí mandan su panel (PanelMapa) */}
        <div ref={slotRef} className="m3d-menu__slot" style={enMapa ? undefined : { display: 'none' }} />
      </div>
      {confirmarSalir && <ConfirmarCerrarSesion onCancel={() => setConfirmarSalir(false)} />}
    </div>
  );
};

export default MenuFlotante;
