import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { t } from '../i18n';
import { offlineStore } from '../utils/offlineStore';

// Grupos de predicación + trabajo de territorios por grupo (Migración 5 en SQL_MIGRATIONS.md).
// Si la migración aún no se corrió, `disponible` queda en false y la app sigue funcionando
// (el progreso se calcula solo con las casas).

const GruposContext = createContext(null);
export const useGrupos = () => useContext(GruposContext);

const ROLES_GESTION_GRUPOS = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

const hoy = () => new Date().toISOString().slice(0, 10);

export const GruposProvider = ({ children }) => {
  const { user } = useAuth();
  const { casas, isOnline } = useData();
  const congregacionId = user?.congregacion_id || null;

  const [disponible, setDisponible] = useState(null); // null = cargando, false = falta migración
  const [grupos, setGrupos] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [historial, setHistorial] = useState([]);

  const casasRef = useRef(casas);
  useEffect(() => { casasRef.current = casas; }, [casas]);

  const byCongregacion = useCallback(
    (q) => (congregacionId ? q.eq('congregacion_id', congregacionId) : q),
    [congregacionId]
  );

  const cargarHistorial = useCallback(async (trabajosData) => {
    // Solo hace falta el historial desde el inicio del trabajo activo más antiguo
    const desde = trabajosData
      .filter(t => t.estado === 'en_progreso' && t.fecha_inicio)
      .map(t => t.fecha_inicio)
      .sort()[0];
    const casaIds = casasRef.current.map(c => c.id);
    if (!desde || !casaIds.length) { setHistorial([]); return []; }
    const filas = [];
    for (let i = 0; i < casaIds.length; i += 200) {
      const { data, error } = await supabase
        .from('historial_visitas')
        .select('casa_id, estado_nuevo, created_at')
        .in('casa_id', casaIds.slice(i, i + 200))
        .gte('created_at', desde);
      if (!error && data) filas.push(...data);
    }
    setHistorial(filas);
    return filas;
  }, []);

  const claveOffline = `grupos:${congregacionId || 'todas'}`;

  // Sin conexión: usar lo último guardado en el dispositivo
  const restaurarOffline = useCallback(async () => {
    const cache = await offlineStore.leerDatos(claveOffline).catch(() => null);
    if (!cache) return false;
    setGrupos(cache.grupos || []);
    setTrabajos(cache.trabajos || []);
    setMiembros(cache.miembros || []);
    setHistorial(cache.historial || []);
    setDisponible(true);
    return true;
  }, [claveOffline]);

  const cargar = useCallback(async () => {
    if (!user) return;
    if (!navigator.onLine) { await restaurarOffline(); return; }
    const gruposRes = await byCongregacion(supabase.from('grupos_predicacion').select('*')).order('nombre');
    if (gruposRes.error) {
      // Tabla inexistente → falta correr la Migración 5. Otro error (red) → usar cache.
      const faltaTabla = gruposRes.error.code === 'PGRST205' || gruposRes.error.code === '42P01';
      if (faltaTabla || !(await restaurarOffline())) setDisponible(false);
      return;
    }
    const [trabajosRes, miembrosRes] = await Promise.all([
      byCongregacion(supabase.from('territorio_trabajos').select('*')).order('fecha_inicio', { ascending: false }),
      byCongregacion(supabase.from('app_usuarios').select('id, nombre, rol, foto_url, grupo_id, activo, congregacion_id')).order('nombre'),
    ]);
    const trabajosData = trabajosRes.data || [];
    setGrupos(gruposRes.data || []);
    setTrabajos(trabajosData);
    setMiembros(miembrosRes.data || []);
    setDisponible(true);
    const historialData = await cargarHistorial(trabajosData);
    offlineStore.guardarDatos(claveOffline, {
      grupos: gruposRes.data || [], trabajos: trabajosData, miembros: miembrosRes.data || [], historial: historialData || [],
    }).catch(() => {});
  }, [user, byCongregacion, cargarHistorial, restaurarOffline, claveOffline]);

  // Carga inicial y recarga al volver la conexión
  useEffect(() => { cargar(); }, [cargar, isOnline]);

  // Recalcular historial cuando cambian las casas (p. ej. carga inicial de DataContext)
  useEffect(() => {
    if (disponible) cargarHistorial(trabajos);
  }, [casas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tiempo real
  useEffect(() => {
    if (!isOnline || !disponible) return;
    const ch = supabase
      .channel('public:grupos_trabajos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grupos_predicacion' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territorio_trabajos' }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'historial_visitas' }, ({ new: h }) => {
        if (casasRef.current.some(c => String(c.id) === String(h.casa_id))) {
          setHistorial(prev => [...prev, { casa_id: h.casa_id, estado_nuevo: h.estado_nuevo, created_at: h.created_at }]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isOnline, disponible, cargar]);

  // ── Derivados ──
  const miGrupo = useMemo(() => {
    const yo = miembros.find(m => String(m.id) === String(user?.id));
    return grupos.find(g => String(g.id) === String(yo?.grupo_id)) || null;
  }, [miembros, grupos, user?.id]);

  const puedeGestionar = ROLES_GESTION_GRUPOS.includes(user?.rol);

  const puedeTerminar = useCallback((trabajo) => {
    if (puedeGestionar) return true;
    const g = grupos.find(x => String(x.id) === String(trabajo?.grupo_id));
    return !!g && String(g.encargado_id) === String(user?.id);
  }, [puedeGestionar, grupos, user?.id]);

  // ── Acciones ──
  const run = async (q) => {
    const { data, error } = await q;
    if (error) {
      // Reglas de la BD (Migración 5e): grupos y territorios no se mezclan entre congregaciones
      if (/otra congregación/.test(error.message)) throw new Error(t(error.message));
      throw error;
    }
    await cargar();
    return data;
  };

  // Cada grupo pertenece a UNA congregación (la del usuario, o la elegida por un Super Admin)
  const crearGrupo = async ({ nombre, color, encargado_id, congregacion_id }) => {
    const cong = congregacion_id || congregacionId;
    if (!cong) throw new Error(t('Selecciona la congregación del grupo'));
    return run(supabase.from('grupos_predicacion').insert([{
      nombre, color, encargado_id: encargado_id || null, congregacion_id: cong,
    }]).select().single());
  };

  const actualizarGrupo = (id, updates) =>
    run(supabase.from('grupos_predicacion').update(updates).eq('id', id));

  const eliminarGrupo = (id) =>
    run(supabase.from('grupos_predicacion').delete().eq('id', id));

  const asignarMiembro = (usuarioId, grupoId) =>
    run(supabase.from('app_usuarios').update({ grupo_id: grupoId || null }).eq('id', usuarioId));

  const asignarTerritorioAGrupo = (territorio, grupoId, notas = null) =>
    run(supabase.from('territorio_trabajos').insert([{
      territorio_id: territorio.id,
      grupo_id: grupoId,
      congregacion_id: territorio.congregacion_id || congregacionId,
      estado: 'en_progreso',
      fecha_inicio: hoy(),
      asignado_por: user?.id || null,
      notas,
    }]));

  const terminarTrabajo = (trabajoId) =>
    run(supabase.from('territorio_trabajos')
      .update({ estado: 'completado', fecha_fin: hoy(), completado_por: user?.id || null })
      .eq('id', trabajoId));

  const cancelarTrabajo = (trabajoId) =>
    run(supabase.from('territorio_trabajos')
      .update({ estado: 'cancelado', fecha_fin: hoy() })
      .eq('id', trabajoId));

  return (
    <GruposContext.Provider value={{
      disponible, grupos, trabajos, miembros, historial, miGrupo,
      puedeGestionar, puedeTerminar, recargar: cargar,
      crearGrupo, actualizarGrupo, eliminarGrupo, asignarMiembro,
      asignarTerritorioAGrupo, terminarTrabajo, cancelarTrabajo,
    }}>
      {children}
    </GruposContext.Provider>
  );
};
