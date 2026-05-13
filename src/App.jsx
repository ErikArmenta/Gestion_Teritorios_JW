import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TerritoriesMap from './pages/TerritoriesMap';
import RegisterHouse from './pages/RegisterHouse';
import DashboardStats from './pages/DashboardStats';
import HousesList from './pages/HousesList';
import UsersList from './pages/UsersList';
import Login from './pages/Login';
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
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 pt-16 md:pt-8 md:p-8 overflow-y-auto flex flex-col">
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
        </Routes>
      </main>
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
