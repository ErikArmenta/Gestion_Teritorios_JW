import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { t } from '../i18n';
import { applyUpdate, getPwaState, isIOS, isStandalone, onPwaChange, promptInstall } from '../utils/pwa';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_DAYS = 14;

const readDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const Banner = ({ icon, title, text, actionLabel, onAction, onClose }) => (
  <div
    className="fixed z-[9990] left-3 right-24 md:left-auto md:right-28 md:w-96 animate-fade-in"
    style={{
      bottom: 'calc(4.25rem + env(safe-area-inset-bottom))',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '1rem',
      boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
      padding: '0.75rem 0.875rem',
    }}
  >
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-primary leading-tight">{title}</p>
        <p className="text-xs text-secondary mt-0.5 leading-snug">{text}</p>
        {actionLabel && (
          <button onClick={onAction} className="btn btn-primary mt-2 py-1.5! px-3! min-h-0! text-xs">
            {actionLabel}
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label={t('Cerrar')}
        className="shrink-0 p-1 rounded-lg"
        style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
      >
        <X size={16} />
      </button>
    </div>
  </div>
);

const PWAPrompts = () => {
  const [pwa, setPwa] = useState(getPwaState);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [updateHidden, setUpdateHidden] = useState(false);

  useEffect(() => onPwaChange(setPwa), []);

  const dismissInstall = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin storage */ }
    setDismissed(true);
  };

  if (pwa.waitingWorker && !updateHidden) {
    return (
      <Banner
        icon={<RefreshCw size={18} />}
        title={t('Nueva versión disponible')}
        text={t('Actualiza para obtener las últimas mejoras.')}
        actionLabel={t('Actualizar')}
        onAction={applyUpdate}
        onClose={() => setUpdateHidden(true)}
      />
    );
  }

  if (dismissed || isStandalone()) return null;

  if (pwa.installPrompt) {
    return (
      <Banner
        icon={<Download size={18} />}
        title={t('Instalar Territorial JW')}
        text={t('Agrégala a tu pantalla de inicio y úsala como una app, incluso sin conexión.')}
        actionLabel={t('Instalar')}
        onAction={async () => { if (!(await promptInstall())) dismissInstall(); }}
        onClose={dismissInstall}
      />
    );
  }

  // iOS Safari no tiene beforeinstallprompt: se explica el paso manual
  if (isIOS()) {
    return (
      <Banner
        icon={<Share size={18} />}
        title={t('Instalar en tu iPhone')}
        text={t('Toca el botón Compartir y luego "Agregar a inicio".')}
        onClose={dismissInstall}
      />
    );
  }

  return null;
};

export default PWAPrompts;
