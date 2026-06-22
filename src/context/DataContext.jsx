import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { offlineStore } from '../utils/offlineStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from './AuthContext';

const DataContext = createContext();
export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const congregacionId = useMemo(() => {
    if (!user) return null;
    return user.rol === 'Super Admin' ? (user.congregacion_id || null) : user.congregacion_id;
  }, [user?.id, user?.rol, user?.congregacion_id]);

  const congregacionIdRef = useRef(congregacionId);
  useEffect(() => { congregacionIdRef.current = congregacionId; }, [congregacionId]);

  const [territorios, setTerritorios] = useState([]);
  const [casas, setCasas] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const isOnline = useOnlineStatus();
  const syncingRef = useRef(false);
  const territoriosRef = useRef([]);

  useEffect(() => { territoriosRef.current = territorios; }, [territorios]);

  // ── Fetch con fallback a cache ──
  const fetchData = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      if (navigator.onLine) {
        // Territorios filtrados por congregación
        const terrQuery = congregacionIdRef.current
          ? supabase.from('territorios').select('*').eq('congregacion_id', congregacionIdRef.current)
          : supabase.from('territorios').select('*');
        const terrRes = await terrQuery;
        const terrData = terrRes.error ? [] : (terrRes.data || []);

        // Casas filtradas por territorio (que ya pertenecen a la congregación)
        const terrIds = terrData.map(t => t.id);
        let casasData = [];
        if (terrIds.length > 0) {
          const casasRes = await supabase.from('casas').select('*').in('territorio_id', terrIds);
          casasData = casasRes.error ? [] : (casasRes.data || []);
        }

        // Asignaciones de territorios con nombre de usuario
        let asignacionesData = [];
        if (terrIds.length > 0) {
          const asigRes = await supabase
            .from('territorio_asignaciones')
            .select('*, app_usuarios(id, nombre)')
            .in('territorio_id', terrIds);
          asignacionesData = asigRes.error ? [] : (asigRes.data || []);
        }

        // Usuarios de la congregación (para selects)
        const usuariosQuery = congregacionIdRef.current
          ? supabase.from('app_usuarios').select('id, nombre').eq('congregacion_id', congregacionIdRef.current)
          : supabase.from('app_usuarios').select('id, nombre');
        const usuariosRes = await usuariosQuery;
        const usuariosData = usuariosRes.error ? [] : (usuariosRes.data || []);

        setTerritorios(terrData);
        setCasas(casasData);
        setAsignaciones(asignacionesData);
        setUsuarios(usuariosData);
        // Cache para uso offline
        await offlineStore.cacheTerritorios(terrData).catch(() => {});
        await offlineStore.cacheCasas(casasData).catch(() => {});
      } else {
        // Sin conexión — servir desde cache
        const [cachedTerr, cachedCasas] = await Promise.all([
          offlineStore.getCachedTerritorios().catch(() => []),
          offlineStore.getCachedCasas().catch(() => []),
        ]);
        setTerritorios(cachedTerr);
        setCasas(cachedCasas);
      }
    } catch (err) {
      console.error('fetchData error:', err);
      // Fallback a cache si hay cualquier error de red
      try {
        const [cachedTerr, cachedCasas] = await Promise.all([
          offlineStore.getCachedTerritorios(),
          offlineStore.getCachedCasas(),
        ]);
        if (cachedTerr.length > 0 || cachedCasas.length > 0) {
          setTerritorios(cachedTerr);
          setCasas(cachedCasas);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  // ── Sync cola de pendientes cuando vuelve la conexión ──
  const syncPendingQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const queue = await offlineStore.getPendingQueue();
      if (queue.length === 0) { setSyncing(false); syncingRef.current = false; return; }

      let syncedCount = 0;
      for (const item of queue) {
        try {
          if (item.type === 'addCasa') {
            // Si tiene foto pendiente (base64), subirla primero
            let foto_url = item.data.foto_url;
            if (item.photoBase64) {
              // Convertir base64 a File y subir
              const res = await fetch(item.photoBase64);
              const blob = await res.blob();
              const file = new File([blob], `offline_${Date.now()}.jpg`, { type: 'image/jpeg' });
              const ext = 'jpg';
              const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
              const { error: upErr } = await supabase.storage.from('fotos_casas').upload(fileName, file);
              if (!upErr) {
                const { data: urlData } = supabase.storage.from('fotos_casas').getPublicUrl(fileName);
                foto_url = urlData.publicUrl;
              }
            }
            const casaData = { ...item.data, foto_url };
            // Asegurar congregacion_id si no viene en la data offline
            if (!casaData.congregacion_id && congregacionIdRef.current) {
              casaData.congregacion_id = congregacionIdRef.current;
            }
            // Eliminar campos temporales
            delete casaData.id; // Remover ID temporal negativo
            delete casaData._offline;
            const { error } = await supabase.from('casas').insert([casaData]);
            if (!error) {
              await offlineStore.removeFromPendingQueue(item.queueId);
              syncedCount++;
            }
          }
          // Se pueden agregar más tipos: updateCasa, deleteCasa, etc.
        } catch (err) {
          console.error('Error syncing item:', item.queueId, err);
          // Dejar en la cola para reintentar después
        }
      }

      if (syncedCount > 0) {
        // Refrescar datos del servidor después de sincronizar
        await fetchData();
      }

      const remaining = await offlineStore.getPendingQueue();
      setPendingCount(remaining.length);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  // ── Init: fetch + check pending ──
  useEffect(() => {
    fetchData();
    offlineStore.getPendingQueue().then(q => setPendingCount(q.length)).catch(() => {});
  }, [congregacionId, user?.id]);

  // ── Realtime (solo cuando online) ──
  useEffect(() => {
    if (!isOnline) return;

    const terrChannel = congregacionIdRef.current
      ? { event: '*', schema: 'public', table: 'territorios', filter: `congregacion_id=eq.${congregacionIdRef.current}` }
      : { event: '*', schema: 'public', table: 'territorios' };

    const terrSub = supabase
      .channel('public:territorios')
      .on('postgres_changes', terrChannel, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTerritorios(prev => { const next = [...prev, payload.new]; offlineStore.cacheTerritorios(next).catch(() => {}); return next; });
        } else if (payload.eventType === 'UPDATE') {
          setTerritorios(prev => { const next = prev.map(t => t.id === payload.new.id ? payload.new : t); offlineStore.cacheTerritorios(next).catch(() => {}); return next; });
        } else if (payload.eventType === 'DELETE') {
          setTerritorios(prev => { const next = prev.filter(t => t.id !== payload.old.id); offlineStore.cacheTerritorios(next).catch(() => {}); return next; });
        }
      })
      .subscribe();

    const casasSub = supabase
      .channel('public:casas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casas' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          // Solo procesar si el territorio pertenece a la congregación del usuario
          if (congregacionId && !territoriosRef.current.some(t => t.id === payload.new.territorio_id)) return;
          setCasas(prev => {
            // Remover el placeholder offline si existe con la misma dirección/territorio
            const cleaned = prev.filter(c => !(c._offline && c.direccion === payload.new.direccion && c.territorio_id === payload.new.territorio_id));
            const next = [...cleaned, payload.new];
            offlineStore.cacheCasas(next).catch(() => {});
            return next;
          });
        } else if (payload.eventType === 'UPDATE') {
          if (congregacionId && !territoriosRef.current.some(t => t.id === payload.new.territorio_id)) return;
          setCasas(prev => { const next = prev.map(c => c.id === payload.new.id ? payload.new : c); offlineStore.cacheCasas(next).catch(() => {}); return next; });
        } else if (payload.eventType === 'DELETE') {
          setCasas(prev => { const next = prev.filter(c => c.id !== payload.old.id); offlineStore.cacheCasas(next).catch(() => {}); return next; });
        }
      })
      .subscribe();

    const asigSub = supabase
      .channel('public:territorio_asignaciones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territorio_asignaciones' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setAsignaciones(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setAsignaciones(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
        } else if (payload.eventType === 'DELETE') {
          setAsignaciones(prev => prev.filter(a => a.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(terrSub);
      supabase.removeChannel(casasSub);
      supabase.removeChannel(asigSub);
    };
  }, [isOnline, congregacionId]);

  // ── Cuando vuelve la conexión, sincronizar pendientes ──
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingQueue();
    }
  }, [isOnline, pendingCount, syncPendingQueue]);

  // ── CRUD functions con soporte offline ──
  const addTerritorio = async (territorio) => {
    const payload = congregacionId ? { ...territorio, congregacion_id: congregacionId } : territorio;
    const { error } = await supabase.from('territorios').insert([payload]);
    if (error) throw error;
  };

  const updateTerritorio = async (id, updates) => {
    const { error } = await supabase.from('territorios').update(updates).eq('id', id);
    if (error) throw error;
  };

  const deleteTerritorio = async (id) => {
    // Cascada manual por si no está configurada en la BD
    await supabase.from('casas').delete().eq('territorio_id', id);
    const { error } = await supabase.from('territorios').delete().eq('id', id);
    if (error) throw error;
  };

  const addCasa = async (casa, photoBase64 = null) => {
    if (navigator.onLine) {
      // Online — insertar directamente
      const { error } = await supabase.from('casas').insert([casa]);
      if (error) throw error;
    } else {
      // Offline — guardar en cola y agregar placeholder local
      const tempId = -Date.now(); // ID temporal negativo
      const offlineCasa = { ...casa, id: tempId, _offline: true };

      // Agregar a la cola de pendientes
      await offlineStore.addToPendingQueue({
        type: 'addCasa',
        data: casa,
        photoBase64: photoBase64, // base64 de la foto para subir después
        timestamp: Date.now(),
      });

      // Agregar al estado local para que se vea inmediatamente
      setCasas(prev => {
        const next = [...prev, offlineCasa];
        offlineStore.cacheCasas(next).catch(() => {});
        return next;
      });

      setPendingCount(prev => prev + 1);
    }
  };

  const updateCasa = async (id, updates) => {
    const { error } = await supabase.from('casas').update(updates).eq('id', id);
    if (error) throw error;
  };

  const deleteCasa = async (id) => {
    const { error } = await supabase.from('casas').delete().eq('id', id);
    if (error) throw error;
  };

  const uploadPhoto = async (file) => {
    if (!navigator.onLine) {
      // Offline: convertir a base64 y retornar como data URL temporal
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); // data:image/...;base64,...
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('fotos_casas').upload(fileName, file);
    if (error) throw error;
    const { data } = supabase.storage.from('fotos_casas').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const insertarHistorialVisita = async ({ casa_id, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, notas }) => {
    const { data, error } = await supabase.from('historial_visitas').insert([{
      casa_id,
      usuario_id,
      usuario_nombre,
      estado_anterior,
      estado_nuevo,
      notas,
    }]);
    if (error) throw error;
    return data;
  };

  const fetchHistorialCasa = async (casaId) => {
    const { data, error } = await supabase
      .from('historial_visitas')
      .select('*')
      .eq('casa_id', casaId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data || [];
  };

  // ── Asignaciones de territorios ──
  const asignarTerritorio = async (data) => {
    const { error } = await supabase.from('territorio_asignaciones').insert([data]);
    if (error) throw error;
  };

  const desasignarTerritorio = async (id) => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('territorio_asignaciones')
      .update({ activa: false, fecha_fin: today })
      .eq('id', id);
    if (error) throw error;
  };

  const getAsignacionesTerritorio = (territorioId) => {
    return asignaciones.filter(a => a.territorio_id === territorioId);
  };

  return (
    <DataContext.Provider value={{
      territorios, casas, asignaciones, usuarios, loading,
      addTerritorio, updateTerritorio, deleteTerritorio,
      addCasa, updateCasa, deleteCasa,
      uploadPhoto,
      insertarHistorialVisita, fetchHistorialCasa,
      asignarTerritorio, desasignarTerritorio, getAsignacionesTerritorio,
      isOnline, pendingCount, syncing, syncPendingQueue,
    }}>
      {children}
    </DataContext.Provider>
  );
};
