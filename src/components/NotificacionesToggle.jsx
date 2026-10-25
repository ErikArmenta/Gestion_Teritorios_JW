import { useState } from 'react';
import { BellRing, BellOff, Bell } from 'lucide-react';
import { estadoPermisoPush, pedirPermisoPush } from '../utils/onesignal';
import { useToast } from './Toast';
import { t } from '../i18n';

// Botón del menú para activar notificaciones en cualquier momento (el aviso automático solo
// sale una vez por sesión y no se puede volver a mostrar si el permiso quedó bloqueado).
const NotificacionesToggle = ({ className, style, iconSize = 16 }) => {
  const toast = useToast();
  const [estado, setEstado] = useState(estadoPermisoPush);

  if (estado === 'unsupported') return null;

  const handleClick = async () => {
    if (estado === 'denied') {
      toast.warning(t('Las notificaciones están bloqueadas. Toca el candado junto a la dirección → Notificaciones → Permitir, y recarga la página.'));
      return;
    }
    const ok = await pedirPermisoPush();
    setEstado(estadoPermisoPush());
    if (ok) toast.success(t('Notificaciones activadas en este dispositivo'));
  };

  const cfg = {
    granted: { icon: <BellRing size={iconSize} />, label: t('Notificaciones activas'), color: '#10B981' },
    denied: { icon: <BellOff size={iconSize} />, label: t('Notificaciones bloqueadas'), color: '#EF4444' },
    default: { icon: <Bell size={iconSize} />, label: t('Activar notificaciones'), color: 'var(--text-secondary)' },
  }[estado] || null;
  if (!cfg) return null;

  return (
    <button type="button" onClick={handleClick} className={className} style={{ ...style, color: cfg.color }}>
      {cfg.icon}
      <span className={iconSize > 16 ? 'text-sm font-semibold' : undefined}>{cfg.label}</span>
    </button>
  );
};

export default NotificacionesToggle;
