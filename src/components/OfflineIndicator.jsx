import React from 'react';
import { useData } from '../context/DataContext';
import { WifiOff, CloudOff, RefreshCw } from 'lucide-react';

const OfflineIndicator = () => {
  const { isOnline, pendingCount, syncing } = useData();

  // Nada que mostrar si online y sin pendientes
  if (isOnline && pendingCount === 0 && !syncing) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2.5 px-4 py-2 text-xs font-semibold transition-all duration-300"
      style={{
        background: !isOnline
          ? 'linear-gradient(90deg, #DC2626, #B91C1C)'
          : syncing
            ? 'linear-gradient(90deg, #2563EB, #1D4ED8)'
            : 'linear-gradient(90deg, #D97706, #B45309)',
        color: 'white',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
      }}
    >
      {!isOnline ? (
        <>
          <WifiOff size={14} />
          <span>Sin conexión — Los datos se guardarán localmente</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
        </>
      ) : syncing ? (
        <>
          <RefreshCw size={14} className="animate-spin" />
          <span>Sincronizando {pendingCount} registro{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}...</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <CloudOff size={14} />
          <span>{pendingCount} registro{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de sincronizar</span>
        </>
      ) : null}
    </div>
  );
};

export default OfflineIndicator;
