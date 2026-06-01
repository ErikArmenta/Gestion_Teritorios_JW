import React, { useState, useEffect, useRef } from 'react';
import { Bell, Home, User, AlertTriangle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

function formatRelative(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

const TIPO_ICON = {
  asignacion: <User size={15} />,
  estado_casa: <Home size={15} />,
  alerta: <AlertTriangle size={15} />,
  sistema: <Bell size={15} />,
};

const TIPO_COLOR = {
  asignacion: '#2563EB',
  estado_casa: '#10B981',
  alerta: '#EF4444',
  sistema: '#64748B',
};

export default function NotificationBell() {
  const { notificaciones, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef(null);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setPanelOpen(false);
      }
    };
    if (panelOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const handleNotifClick = async (n) => {
    if (!n.leida) await markAsRead(n.id);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Botón campana */}
      <button
        onClick={() => setPanelOpen(prev => !prev)}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          transition: 'background 0.15s',
        }}
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '18px',
              height: '18px',
              borderRadius: '9999px',
              background: '#EF4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {panelOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '340px',
            maxWidth: 'calc(100vw - 24px)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px 10px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#2563EB',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '6px',
                }}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div style={{ maxHeight: '384px', overflowY: 'auto' }}>
            {notificaciones.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Sin notificaciones
              </div>
            ) : (
              notificaciones.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 16px',
                    background: n.leida ? 'transparent' : 'rgba(37,99,235,0.05)',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Ícono tipo */}
                  <span
                    style={{
                      flexShrink: 0,
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: `${TIPO_COLOR[n.tipo] || '#64748B'}18`,
                      color: TIPO_COLOR[n.tipo] || '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '1px',
                    }}
                  >
                    {TIPO_ICON[n.tipo] || <Bell size={15} />}
                  </span>

                  {/* Contenido */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: n.leida ? 500 : 700,
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.titulo}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                    {n.mensaje && (
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.mensaje}
                      </p>
                    )}
                  </div>

                  {/* Dot no leído */}
                  {!n.leida && (
                    <span
                      style={{
                        flexShrink: 0,
                        width: '7px',
                        height: '7px',
                        borderRadius: '9999px',
                        background: '#2563EB',
                        marginTop: '6px',
                      }}
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
