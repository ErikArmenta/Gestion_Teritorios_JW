import React, { useState, useEffect, useRef } from 'react';
import { Bell, Home, User, AlertTriangle, ShoppingCart, Check, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useData } from '../context/DataContext';
import { supabase } from '../supabaseClient';

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
  exhibidor: <ShoppingCart size={15} />,
  exhibidor_respuesta: <ShoppingCart size={15} />,
};

const TIPO_COLOR = {
  asignacion: '#2563EB',
  estado_casa: '#10B981',
  alerta: '#EF4444',
  sistema: '#64748B',
  exhibidor: '#F59E0B',
  exhibidor_respuesta: '#10B981',
};

export default function NotificationBell() {
  const { notificaciones, unreadCount, markAsRead, markAllAsRead, createNotification } = useNotifications();
  const { updateExhibidorTurno } = useData();
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
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

  const handleExhibidorAction = async (notif, confirmar) => {
    const meta = notif.metadata || {};
    if (!meta.turno_id) return;
    setActionLoading(notif.id);
    try {
      const nuevoEstado = confirmar ? 'aceptado' : 'rechazado';
      await updateExhibidorTurno(meta.turno_id, { estado: nuevoEstado });

      // Marcar notificación como leída y actualizar metadata
      await supabase
        .from('notificaciones')
        .update({
          leida: true,
          metadata: { ...meta, accion_requerida: null, respondido: confirmar ? 'confirmado' : 'no_asistire' }
        })
        .eq('id', notif.id);

      // Notificar al que asignó
      const { data: turnoData } = await supabase
        .from('exhibidor_turnos')
        .select('asignado_por')
        .eq('id', meta.turno_id)
        .single();

      if (turnoData?.asignado_por) {
        try {
          await createNotification({
            usuario_destino_id: turnoData.asignado_por,
            tipo: 'exhibidor_respuesta',
            titulo: confirmar ? '✅ Asistencia confirmada' : '❌ No asistirá',
            mensaje: confirmar
              ? `Confirmó asistencia al exhibidor "${meta.exhibidor_nombre}" el ${meta.fecha}`
              : `No asistirá al exhibidor "${meta.exhibidor_nombre}" el ${meta.fecha}`,
            metadata: { turno_id: meta.turno_id, exhibidor_nombre: meta.exhibidor_nombre },
          });
        } catch {}
      }

      // Re-fetch notificaciones para actualizar UI
      await markAsRead(notif.id);
    } catch (err) {
      console.error('Error handling exhibidor action:', err);
    } finally {
      setActionLoading(null);
    }
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

                    {/* Botones de acción para exhibidores */}
                    {n.tipo === 'exhibidor' && n.metadata?.accion_requerida === 'confirmar_asistencia' && !n.leida && (
                      <div
                        style={{ display: 'flex', gap: '6px', marginTop: '8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExhibidorAction(n, true); }}
                          disabled={actionLoading === n.id}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#10B981',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: actionLoading === n.id ? 0.6 : 1,
                          }}
                        >
                          <Check size={12} /> Confirmo asistencia
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExhibidorAction(n, false); }}
                          disabled={actionLoading === n.id}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '8px',
                            border: '1px solid #EF4444',
                            background: 'transparent',
                            color: '#EF4444',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: actionLoading === n.id ? 0.6 : 1,
                          }}
                        >
                          <X size={12} /> No asistiré
                        </button>
                      </div>
                    )}

                    {/* Badge de respuesta ya dada */}
                    {n.tipo === 'exhibidor' && n.metadata?.respondido && (
                      <div style={{
                        marginTop: '6px',
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'inline-block',
                        background: n.metadata.respondido === 'confirmado' ? '#D1FAE5' : '#FEE2E2',
                        color: n.metadata.respondido === 'confirmado' ? '#065F46' : '#991B1B',
                      }}>
                        {n.metadata.respondido === 'confirmado' ? '✅ Asistencia confirmada' : '❌ No asistirá'}
                      </div>
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
