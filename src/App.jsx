import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
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
import OfflineIndicator from './components/OfflineIndicator';
import PanicButton from './components/PanicButton';
import PanicAlert from './components/PanicAlert';
import BottomNav from './components/BottomNav';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import NotificationBell from './components/NotificationBell';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="skeleton w-64 h-8 rounded-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.rol)) return <Navigate to="/" replace />;
  return children;
};

const AppLayout = () => {
  const { user } = useAuth();
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  // Register Service Worker once
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Show notification modal once per session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('notif_banner_dismissed');
    if (!dismissed) {
      setShowNotifBanner(true);
    }
  }, []);

  const handleAllowNotifications = async () => {
    setShowNotifBanner(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.pushManager.subscribe({
          userVisibleOnly: true,
        }).catch(() => null);
      } catch {
        // pushManager not supported or VAPID not configured
      }
    }
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar />
      <OfflineIndicator />
      <main
        className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto flex flex-col"
      >
        {/* Top bar: NotificationBell */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <NotificationBell />
        </div>
        <Routes>
          <Route path="/" element={<TerritoriesMap />} />
          <Route path="/register" element={<RegisterHouse />} />
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
          <Route path="/profile" element={<Profile />} />
          <Route path="/backup" element={
            <ProtectedRoute allowedRoles={['Super Admin']}>
              <Backup />
            </ProtectedRoute>
          } />
        </Routes>
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
            className="w-full max-w-[95vw] sm:max-w-[80vw] md:max-w-[50vw] lg:max-w-[35vw] xl:max-w-[28vw] animate-scale-in"
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
                Activar Notificaciones
              </h3>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: '#64748B' }}>
                Activa las notificaciones para recibir alertas de emergencia
                de tus compañeros incluso con la app cerrada.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    sessionStorage.setItem('notif_banner_dismissed', 'true');
                    setShowNotifBanner(false);
                  }}
                  className="btn btn-outline flex-1"
                >
                  Ahora no
                </button>
                <button
                  onClick={() => {
                    handleAllowNotifications();
                    sessionStorage.setItem('notif_banner_dismissed', 'true');
                  }}
                  className="btn btn-primary flex-1"
                >
                  Activar
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
      <BottomNav />
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <DataProvider>
        <NotificationProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/shared/:id" element={<SharedTerritory />} />
              <Route path="/*" element={<AppLayout />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
        </NotificationProvider>
      </DataProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
