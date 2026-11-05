import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import { t } from '../i18n';

// "¿Seguro que quieres cerrar sesión?" — lo usan la Sidebar, el menú flotante y la BottomNav.
const ConfirmarCerrarSesion = ({ onCancel }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <ConfirmModal
      message={t('¿Cerrar sesión?')}
      detail={t('Tendrás que volver a iniciar sesión para usar la app.')}
      confirmText={t('Sí, cerrar sesión')}
      cancelText={t('Cancelar')}
      danger
      onConfirm={() => { onCancel?.(); logout(); navigate('/login'); }}
      onCancel={onCancel}
    />
  );
};

export default ConfirmarCerrarSesion;
