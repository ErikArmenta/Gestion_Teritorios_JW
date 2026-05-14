import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TerritoriesMap from './pages/TerritoriesMap';
import RegisterHouse from './pages/RegisterHouse';
import DashboardStats from './pages/DashboardStats';
import HousesList from './pages/HousesList';
import UsersList from './pages/UsersList';
import PanicHistory from './pages/PanicHistory';
import Login from './pages/Login';
import PanicButton from './components/PanicButton';
import PanicAlert from './components/PanicAlert';
import BottomNav from './components/BottomNav';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';

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

  // Show notification permission banner if not yet decided
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
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
      <main
        className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto flex flex-col"
      >
        <Routes>
          <Route path="/" element={<TerritoriesMap />} />
          <Route path="/register" element={<RegisterHouse />} />
          <Route path="/stats" element={
            <ProtectedRoute allowedRoles={['Admin Principal', 'Anciano', 'Ministerial']}>
              <DashboardStats />
            </ProtectedRoute>
          } />
          <Route path="/list" element={
            <ProtectedRoute allowedRoles={['Admin Principal', 'Anciano', 'Ministerial']}>
              <HousesList />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['Admin Principal']}>
              <UsersList />
            </ProtectedRoute>
          } />
          <Route path="/alerts" element={
            <ProtectedRoute allowedRoles={['Admin Principal']}>
              <PanicHistory />
            </ProtectedRoute>
          } />
        </Routes>
      </main>

      {/* Notification permission banner */}
      {showNotifBanner && (
        <div
          className="fixed top-0 left-0 right-0 z-[9990] flex items-center justify-between gap-3 px-4 py-3 text-sm"
          style={{ backgroundColor: '#EFF6FF', borderBottom: '1px solid rgba(59,130,246,0.25)' }}
        >
          <span className="leading-snug" style={{ color: '#1E40AF' }}>
            Activa las notificaciones para recibir alertas de emergencia de tus compañeros incluso con la app cerrada.
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleAllowNotifications}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: '#2563EB' }}
            >
              Activar
            </button>
            <button
              onClick={() => setShowNotifBanner(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#64748B' }}
            >
              Ahora no
            </button>
          </div>
        </div>
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
    <AuthProvider>
      <DataProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={<AppLayout />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
