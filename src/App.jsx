import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MenuFlotante from './components/MenuFlotante';
import { Fallo3D } from './components/Vista3D';
import { MapaFondoProvider, useMapaFondo } from './context/MapaFondoContext';
import { RUTAS_MAPA } from './utils/menu';
import useEsMovil from './hooks/useEsMovil';
import TerritoriesMap from './pages/TerritoriesMap';
import RegisterHouse from './pages/RegisterHouse';
import DashboardStats from './pages/DashboardStats';
import HousesList from './pages/HousesList';
import UsersList from './pages/UsersList';
import PanicHistory from './pages/PanicHistory';
import CongregacionesList from './pages/CongregacionesList';
import Login from './pages/Login';
import Profile from './pages/Profile';
import SharedTerritory from './pages/SharedTerritory';
import Backup from './pages/Backup';
import Exhibidores from './pages/Exhibidores';
import Grupos from './pages/Grupos';
import TerritoriosAdmin from './pages/TerritoriosAdmin';
import Informes from './pages/Informes';
import OfflineIndicator from './components/OfflineIndicator';
import ErrorPantalla from './components/ErrorPantalla';
import PanicButton from './components/PanicButton';
import PanicAlert from './components/PanicAlert';
import AvisoAseo from './components/AvisoAseo';
import AvisoInactividad from './components/AvisoInactividad';
import BottomNav from './components/BottomNav';
import { DataProvider } from './context/DataContext';
import { GruposProvider } from './context/GruposContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import NotificationBell from './components/NotificationBell';
import PWAPrompts from './components/PWAPrompts';
import { LanguageProvider, useLanguage, t } from './i18n';
import { useGrupos } from './context/GruposContext';
import { identificarUsuario, pedirPermisoPush } from './utils/onesignal';

// Al cambiar de idioma se vuelven a montar las pantallas para que todos los t() se actualicen
const LangKeyed = ({ children }) => {
  const { lang } = useLanguage();
  return <React.Fragment key={lang}>{children}</React.Fragment>;
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="skeleton w-64 h-8 rounded-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.rol)) return <Navigate to="/" replace />;
  return children;
};

// Mapa 3D de fondo, compartido por las pantallas con mapa (se carga aparte con MapLibre)
const MapaFondo = lazy(() => import('./components/MapaFondo'));

// El menú contextual del navegador no aparece en la app (el clic derecho regresa el menú flotante
// a su lugar y en el mapa gira/inclina). En cajas de texto sí, para copiar y pegar.
const esCampoDeTexto = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"]');

const AppLayout = () => {
  const { user } = useAuth();
  const { miGrupo } = useGrupos();
  const { disponible: mapa3D, marcarFallo } = useMapaFondo();
  const { pathname } = useLocation();
  const esMovil = useEsMovil();

  // Pantalla con mapa 3D: un solo mapa de fondo; en escritorio el menú flota sobre él
  const modoMapa = mapa3D && RUTAS_MAPA.includes(pathname);
  // El mapa se monta la primera vez que se necesita y luego solo se oculta (vuelve al instante)
  const [mapaMontado, setMapaMontado] = useState(false);
  if (modoMapa && !mapaMontado) setMapaMontado(true);

  useEffect(() => {
    const bloquear = (e) => { if (!esCampoDeTexto(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', bloquear);
    return () => document.removeEventListener('contextmenu', bloquear);
  }, []);

  // Push (OneSignal): vincular este dispositivo con el usuario, su congregación, rol y grupo
  useEffect(() => {
    if (user) identificarUsuario(user, miGrupo?.id);
  }, [user, miGrupo?.id]);

  // Show notification modal once per session (only if the browser supports it and hasn't decided yet)
  const [showNotifBanner, setShowNotifBanner] = useState(() =>
    !sessionStorage.getItem('notif_banner_dismissed') &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default'
  );

  if (!user) return <Navigate to="/login" replace />;

  const handleAllowNotifications = async () => {
    setShowNotifBanner(false);
    // Con OneSignal configurado suscribe el dispositivo a push; si no, solo pide el permiso del navegador
    await pedirPermisoPush();
  };

  return (
    <div className="flex min-h-screen" style={{ overflowX: 'clip' }}>
      {/* Escritorio: menú flotante en todas las pantallas (en las de mapa lleva el panel de la pantalla;
          en las demás, accesos con nombre y se colapsa a la columna de iconos). Celular: BottomNav. */}
      {!esMovil && <MenuFlotante enMapa={modoMapa} />}
      {mapa3D && mapaMontado && (
        <Fallo3D onError={marcarFallo}>
          <Suspense fallback={null}>
            <MapaFondo visible={modoMapa} />
          </Suspense>
        </Fallo3D>
      )}
      <OfflineIndicator />
      <main
        className="flex-1 min-w-0 p-4 pb-24 md:p-8 md:pb-8 md:pl-[100px] overflow-y-auto flex flex-col"
      >
        {/* Top bar: NotificationBell (en el celular, quién eres va en el menú "Más") */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <NotificationBell />
        </div>
        {/* Si una pantalla truena: aviso amable en vez de pantalla en blanco (y se reporta el error) */}
        <ErrorPantalla clave={pathname}>
        <Routes>
          <Route path="/" element={<TerritoriesMap />} />
          <Route path="/register" element={<RegisterHouse />} />
          <Route path="/informes" element={<Informes />} />
          <Route path="/stats" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial']}>
              <DashboardStats />
            </ProtectedRoute>
          } />
          <Route path="/list" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial']}>
              <HousesList />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal']}>
              <UsersList />
            </ProtectedRoute>
          } />
          <Route path="/alerts" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal']}>
              <PanicHistory />
            </ProtectedRoute>
          } />
          <Route path="/congregaciones" element={
            <ProtectedRoute allowedRoles={['Super Admin']}>
              <CongregacionesList />
            </ProtectedRoute>
          } />
          <Route path="/territorios" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial']}>
              <TerritoriosAdmin />
            </ProtectedRoute>
          } />
          <Route path="/grupos" element={
            <ProtectedRoute allowedRoles={['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial']}>
              <Grupos />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={<Profile />} />
          <Route path="/exhibidores" element={<Exhibidores />} />
          <Route path="/backup" element={
            <ProtectedRoute allowedRoles={['Super Admin']}>
              <Backup />
            </ProtectedRoute>
          } />
        </Routes>
        </ErrorPantalla>
      </main>

      {/* Notification permission modal */}
      {showNotifBanner && createPortal(
        <div
          className="fixed inset-0 z-[9997] flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="w-full max-w-[95vw] sm:max-w-[80vw] md:max-w-[50vw] lg:max-w-[35vw] xl:max-w-[28vw] animate-scale-in light-surface"
            style={{
              background: '#FFFFFF',
              borderRadius: '1.25rem',
              padding: '1.75rem',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                   style={{ background: 'rgba(59,130,246,0.1)' }}>
                <Bell size={28} style={{ color: '#2563EB' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: '#0F172A' }}>
                {t('Activar Notificaciones')}
              </h3>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: '#64748B' }}>
                {t('Activa las notificaciones para recibir alertas de emergencia de tus compañeros incluso con la app cerrada.')}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    sessionStorage.setItem('notif_banner_dismissed', 'true');
                    setShowNotifBanner(false);
                  }}
                  className="btn btn-outline flex-1"
                >
                  {t('Ahora no')}
                </button>
                <button
                  onClick={() => {
                    handleAllowNotifications();
                    sessionStorage.setItem('notif_banner_dismissed', 'true');
                  }}
                  className="btn btn-primary flex-1"
                >
                  {t('Activar')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Panic module — always visible when authenticated */}
      <PanicButton />
      <PanicAlert />
      <AvisoAseo />
      <AvisoInactividad />
      <BottomNav />
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
      <DataProvider>
        <GruposProvider>
        <NotificationProvider>
        <ToastProvider>
          <BrowserRouter>
            <LangKeyed>
            <ErrorPantalla>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/shared/:id" element={<SharedTerritory />} />
              <Route path="/*" element={<MapaFondoProvider><AppLayout /></MapaFondoProvider>} />
            </Routes>
            </ErrorPantalla>
            <PWAPrompts />
            </LangKeyed>
          </BrowserRouter>
        </ToastProvider>
        </NotificationProvider>
        </GruposProvider>
      </DataProvider>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
