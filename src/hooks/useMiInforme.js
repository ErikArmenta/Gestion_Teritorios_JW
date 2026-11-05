import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { offlineStore } from '../utils/offlineStore';
import { anioServicio, finDeMes, totalesDe } from '../utils/informes';

// "Mi informe" (Migración 7): perfil del usuario (tipo de publicador y metas), sus salidas del mes y
// del año de servicio, y su informe del mes. Sin conexión: lo último guardado en el dispositivo + lo
// que está en la cola de pendientes (salidas e informe), que DataContext sube al volver la red.
// disponible = false si la Migración 7 aún no se corre.

const faltaMigracion = (error) => ['PGRST205', '42P01', '42703', 'PGRST204'].includes(error?.code);

export default function useMiInforme(mes) {
  const { user } = useAuth();
  const { isOnline, pendingCount, recontarPendientes } = useData();
  const [disponible, setDisponible] = useState(null); // null = cargando
  const [perfil, setPerfil] = useState(null);         // { tipo_publicador, meta_horas_mensual, meta_horas_anual }
  const [registrosAnio, setRegistrosAnio] = useState([]);
  const [informe, setInforme] = useState(null);
  const [pendientes, setPendientes] = useState([]);   // cola offline de este usuario

  const anio = useMemo(() => anioServicio(mes), [mes]);
  const claveCache = user ? `informe:${user.id}:${anio.desde}` : null;

  const leerPendientes = useCallback(async () => {
    const cola = await offlineStore.getPendingQueue().catch(() => []);
    return cola.filter(op =>
      (op.type === 'addRegistroServicio' || op.type === 'guardarInformeServicio')
      && String(op.data?.usuario_id) === String(user?.id));
  }, [user?.id]);

  const cargar = useCallback(async () => {
    if (!user) return;
    setPendientes(await leerPendientes());
    if (!navigator.onLine) {
      const cache = claveCache && await offlineStore.leerDatos(claveCache).catch(() => null);
      if (cache) {
        setPerfil(cache.perfil); setRegistrosAnio(cache.registrosAnio || []);
        setInforme((cache.informes || []).find(i => i.mes === mes) || null);
        setDisponible(true);
      } else if (disponible === null) setDisponible(false);
      return;
    }
    const perfilRes = await supabase.from('app_usuarios')
      .select('tipo_publicador, meta_horas_mensual, meta_horas_anual').eq('id', user.id).single();
    if (perfilRes.error) { if (faltaMigracion(perfilRes.error)) setDisponible(false); return; }
    // Todo el año de servicio de una vez: alcanza para el avance anual y para cualquier mes de ese año
    const [regRes, infRes] = await Promise.all([
      supabase.from('registros_servicio').select('*')
        .eq('usuario_id', user.id).gte('fecha', anio.desde).lte('fecha', anio.hasta)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('informes_servicio').select('*')
        .eq('usuario_id', user.id).gte('mes', anio.desde).lte('mes', anio.hasta),
    ]);
    if (regRes.error || infRes.error) {
      if (faltaMigracion(regRes.error) || faltaMigracion(infRes.error)) setDisponible(false);
      return;
    }
    setPerfil(perfilRes.data);
    setRegistrosAnio(regRes.data || []);
    setInforme((infRes.data || []).find(i => i.mes === mes) || null);
    setDisponible(true);
    if (claveCache) {
      offlineStore.guardarDatos(claveCache, { perfil: perfilRes.data, registrosAnio: regRes.data || [], informes: infRes.data || [] }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mes, anio.desde, anio.hasta, claveCache, leerPendientes]);

  // Carga inicial, al cambiar de mes, al volver la red y cuando la cola se sube
  useEffect(() => { cargar(); }, [cargar, isOnline, pendingCount]);

  // Salidas: las del servidor + las que esperan subirse (se marcan _offline)
  const registrosTodos = useMemo(() => [
    ...pendientes.filter(p => p.type === 'addRegistroServicio').map(p => ({ ...p.data, id: `cola-${p.queueId}`, _offline: true })),
    ...registrosAnio,
  ], [pendientes, registrosAnio]);

  const registrosMes = useMemo(
    () => registrosTodos.filter(r => r.fecha >= mes && r.fecha <= finDeMes(mes)),
    [registrosTodos, mes]
  );
  const totalesMes = useMemo(() => totalesDe(registrosMes), [registrosMes]);
  const totalesAnio = useMemo(() => totalesDe(registrosTodos), [registrosTodos]);

  const informePendiente = pendientes.find(p => p.type === 'guardarInformeServicio' && p.data?.mes === mes);
  const informeMes = informePendiente ? { ...informePendiente.data, _offline: true } : informe;

  const agregarRegistro = async (datos) => {
    const fila = { ...datos, usuario_id: user.id, congregacion_id: user.congregacion_id || null };
    if (navigator.onLine) {
      const { data, error } = await supabase.from('registros_servicio').insert([fila]).select().single();
      if (error) throw error;
      setRegistrosAnio(prev => [data, ...prev]);
      return;
    }
    await offlineStore.addToPendingQueue({ type: 'addRegistroServicio', data: fila, timestamp: Date.now() });
    setPendientes(await leerPendientes());
    recontarPendientes();
  };

  const eliminarRegistro = async (registro) => {
    if (registro._offline) {
      await offlineStore.removeFromPendingQueue(Number(String(registro.id).replace('cola-', '')));
      setPendientes(await leerPendientes());
      recontarPendientes();
      return;
    }
    const { error } = await supabase.from('registros_servicio').delete().eq('id', registro.id);
    if (error) throw error;
    setRegistrosAnio(prev => prev.filter(r => r.id !== registro.id));
  };

  const guardarMetas = async ({ mensual, anual }) => {
    const cambios = { meta_horas_mensual: mensual ?? null, meta_horas_anual: anual ?? null };
    const { error } = await supabase.from('app_usuarios').update(cambios).eq('id', user.id);
    if (error) throw error;
    setPerfil(p => ({ ...p, ...cambios }));
  };

  // Informe del mes: los precursores mandan los totales de sus salidas; los publicadores la casilla
  const enviarInforme = async ({ predico, estudios, comentarios }) => {
    const tipo = perfil?.tipo_publicador || 'Publicador';
    const precursor = tipo !== 'Publicador';
    const fila = {
      usuario_id: user.id,
      congregacion_id: user.congregacion_id || null,
      mes,
      tipo_publicador: tipo,
      predico: precursor ? totalesMes.horas > 0 || !!predico : !!predico,
      estudios: Math.max(0, parseInt(estudios, 10) || 0),
      horas: precursor ? Number(totalesMes.horas.toFixed(2)) : 0,
      revisitas: precursor ? totalesMes.revisitas : 0,
      horas_servicio_sagrado: precursor ? Number(totalesMes.servicioSagrado.toFixed(2)) : 0,
      comentarios: comentarios?.trim() || null,
      enviado_en: new Date().toISOString(),
    };
    if (navigator.onLine) {
      const { data, error } = await supabase.from('informes_servicio').upsert([fila], { onConflict: 'usuario_id,mes' }).select().single();
      if (error) throw error;
      setInforme(data);
      return;
    }
    // Sin conexión: reemplaza un envío pendiente del mismo mes
    const viejo = (await leerPendientes()).find(p => p.type === 'guardarInformeServicio' && p.data?.mes === mes);
    if (viejo) await offlineStore.removeFromPendingQueue(viejo.queueId);
    await offlineStore.addToPendingQueue({ type: 'guardarInformeServicio', data: fila, timestamp: Date.now() });
    setPendientes(await leerPendientes());
    recontarPendientes();
  };

  return {
    disponible, perfil, registrosMes, totalesMes, totalesAnio, anio, informe: informeMes,
    agregarRegistro, eliminarRegistro, guardarMetas, enviarInforme, recargar: cargar,
  };
}
