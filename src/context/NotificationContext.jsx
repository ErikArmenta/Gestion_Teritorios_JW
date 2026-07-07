import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotificaciones = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_destino_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching notificaciones:', error);
    }
    if (!error && data) {
      setNotificaciones(data);
      setUnreadCount(data.filter(n => !n.leida).length);
    }
  }, [user]);

  useEffect(() => {
    fetchNotificaciones();
  }, [fetchNotificaciones]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notificaciones_usuario_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_destino_id=eq.${user.id}`,
        },
        (payload) => {
          setNotificaciones(prev => {
            const updated = [payload.new, ...prev].slice(0, 20);
            setUnreadCount(updated.filter(n => !n.leida).length);
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_destino_id=eq.${user.id}`,
        },
        (payload) => {
          setNotificaciones(prev => {
            const updated = prev.map(n => n.id === payload.new.id ? payload.new : n);
            setUnreadCount(updated.filter(n => !n.leida).length);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (id) => {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id);

    if (!error) {
      setNotificaciones(prev => {
        const updated = prev.map(n => n.id === id ? { ...n, leida: true } : n);
        setUnreadCount(updated.filter(n => !n.leida).length);
        return updated;
      });
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('usuario_destino_id', user.id)
      .eq('leida', false);

    if (!error) {
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
      setUnreadCount(0);
    }
  };

  const createNotification = async (data) => {
    const { error } = await supabase
      .from('notificaciones')
      .insert([data]);

    if (error) throw error;
  };

  return (
    <NotificationContext.Provider value={{
      notificaciones,
      unreadCount,
      markAsRead,
      markAllAsRead,
      createNotification,
      refetch: fetchNotificaciones,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
