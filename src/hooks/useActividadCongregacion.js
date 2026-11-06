import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { offlineStore } from '../utils/offlineStore';
import {
  estadoActividad, finDeMes, hoyLocal, mesActual, sumarMeses,
  MESES_INACTIVIDAD_DEFECTO, MESES_INACTIVIDAD_OPCIONES,
} from '../utils/informes';

// Actividad de la congregación (ancianos, ministeriales y admins): quién está predicando, quién no,
// cuánto lleva sin predicar y quién ya está inactivo. Ver estadoActividad() en utils/informes.js.
// Fuentes (últimos 13 meses): informes con "Prediqué", salidas con horas de predicación y visitas
// registradas en el mapa (historial_visitas). Todo filtrado por la congregación del usuario.
// El umbral de inactividad es por congregación (congregaciones.meses_inactividad, Migración 9); sin la
// migración (o Super Admin sin congregación) se guarda solo en este dispositivo.

const PAGINA = 1000;
const faltaColumna = (error) => ['42703', 'PGRST204'].includes(error?.code);
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };

// Trae todas las filas de una consulta (Supabase da máximo 1000 por petición)
const traerTodo = async (armar, maximo = 30000) => {
  const filas = [];
  for (let i = 0; i < maximo; i += PAGINA) {
    const { data, error } = await armar().range(i, i + PAGINA - 1);
    if (error) return { data: filas, error };
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return { data: filas, error: null };
};

const leerLocal = (clave) => {
  try { const n = Number(localStorage.getItem(clave)); return MESES_INACTIVIDAD_OPCIONES.includes(n) ? n : null; } catch { return null; }
};

export default function useActividadCongregacion(activo = true) {
  const { user } = useAuth();
  const { isOnline } = useData();
  const congregacionId = user?.congregacion_id || null;
  const claveLocal = `meses_inactividad:${congregacionId || 'todas'}`;
  const claveCache = `actividad-cong:${congregacionId || 'todas'}`;

  const [umbral, setUmbral] = useState(() => leerLocal(claveLocal) || MESES_INACTIVIDAD_DEFECTO);
  const [umbralEnBD, setUmbralEnBD] = useState(false); // true = se comparte con toda la congregación
  const [datos, setDatos] = useState(null); // { miembros, ultimas: {id: {fecha, fuente}}, mes: {id: {visitas, horas}} }
  const [error, setError] = useState(null);

  const porCongregacion = useCallback((q) => (congregacionId ? q.eq('congregacion_id', congregacionId) : q), [congregacionId]);

  const cargar = useCallback(async () => {
    if (!user || !activo) return;
    if (!navigator.onLine) {
      const cache = await offlineStore.leerDatos(claveCache).catch(() => null);
      setDatos(cache || { miembros: [], ultimas: {}, mes: {} });
      return;
    }
    const hoy = hoyLocal();
    const mes = mesActual();
    const desde = sumarMeses(mes, -(Math.max(...MESES_INACTIVIDAD_OPCIONES) + 1));

    // Umbral de la congregación (Migración 9)
    if (congregacionId) {
      const { data: cong, error: errCong } = await supabase.from('congregaciones')
        .select('meses_inactividad').eq('id', congregacionId).maybeSingle();
      if (!errCong && cong && MESES_INACTIVIDAD_OPCIONES.includes(Number(cong.meses_inactividad))) {
        setUmbral(Number(cong.meses_inactividad));
        setUmbralEnBD(true);
      } else setUmbralEnBD(false);
    }

    const miembrosRes = await porCongregacion(supabase.from('app_usuarios')
      .select('id, nombre, rol, tipo_publicador, activo, created_at')).order('nombre');
    if (miembrosRes.error) { setError(miembrosRes.error); return; }
    const miembros = (miembrosRes.data || []).filter(m => m.activo !== false);
    const ids = miembros.map(m => m.id);

    const [informesRes, registrosRes] = await Promise.all([
      traerTodo(() => porCongregacion(supabase.from('informes_servicio').select('id, usuario_id, mes'))
        .eq('predico', true).gte('mes', desde).order('id')),
      traerTodo(() => porCongregacion(supabase.from('registros_servicio').select('id, usuario_id, fecha, horas'))
        .eq('categoria', 'predicacion').gt('horas', 0).gte('fecha', desde).order('id')),
    ]);
    // Visitas en el mapa (historial_visitas no tiene congregación: se filtra por los miembros)
    const visitas = [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const res = await traerTodo(() => supabase.from('historial_visitas').select('id, usuario_id, created_at')
        .in('usuario_id', lote).gte('created_at', `${desde}T00:00:00`).order('id'));
      visitas.push(...res.data);
    }

    const ultimas = {};
    const delMes = {};
    const anotar = (usuarioId, fecha, fuente) => {
      const k = String(usuarioId);
      if (!ultimas[k] || fecha > ultimas[k].fecha) ultimas[k] = { fecha, fuente };
    };
    const sumarMes = (usuarioId, campo, n) => {
      const k = String(usuarioId);
      delMes[k] = delMes[k] || { visitas: 0, horas: 0 };
      delMes[k][campo] += n;
    };
    // Informe del mes = actividad al final de ese mes (o hoy, si es el mes en curso)
    for (const inf of informesRes.data) { const fin = finDeMes(inf.mes); anotar(inf.usuario_id, fin < hoy ? fin : hoy, 'informe'); }
    for (const r of registrosRes.data) {
      anotar(r.usuario_id, r.fecha, 'horas');
      if (r.fecha >= mes) sumarMes(r.usuario_id, 'horas', Number(r.horas) || 0);
    }
    for (const v of visitas) {
      const f = fechaLocal(v.created_at);
      anotar(v.usuario_id, f, 'visitas');
      if (f >= mes) sumarMes(v.usuario_id, 'visitas', 1);
    }

    const nuevos = { miembros, ultimas, mes: delMes };
    setError(informesRes.error || registrosRes.error || null);
    setDatos(nuevos);
    offlineStore.guardarDatos(claveCache, nuevos).catch(() => {});
  }, [user, activo, congregacionId, claveCache, porCongregacion]);

  useEffect(() => { cargar(); }, [cargar, isOnline]);

  const filas = useMemo(() => {
    if (!datos) return [];
    const orden = { inactivo: 0, sin_predicar: 1, activo: 2 };
    return datos.miembros.map(m => {
      const ult = datos.ultimas[String(m.id)] || null;
      const delMes = datos.mes[String(m.id)] || { visitas: 0, horas: 0 };
      return {
        id: m.id,
        nombre: m.nombre,
        rol: m.rol,
        tipo: m.tipo_publicador || 'Publicador',
        ultima: ult?.fecha || null,
        fuente: ult?.fuente || null,
        visitasMes: delMes.visitas,
        horasMes: delMes.horas,
        ...estadoActividad(ult?.fecha || null, umbral, { creado: m.created_at ? fechaLocal(m.created_at) : null }),
      };
    }).sort((a, b) => (orden[a.estado] - orden[b.estado])
      || ((b.dias ?? Infinity) - (a.dias ?? Infinity))
      || String(a.nombre).localeCompare(String(b.nombre)));
  }, [datos, umbral]);

  const conteo = useMemo(() => filas.reduce((acc, f) => { acc[f.estado] += 1; return acc; },
    { activo: 0, sin_predicar: 0, inactivo: 0 }), [filas]);

  // Devuelve 'bd' (para toda la congregación) o 'local' (solo este dispositivo)
  const guardarUmbral = async (n) => {
    setUmbral(n);
    try { localStorage.setItem(claveLocal, String(n)); } catch { /* sin storage */ }
    if (!congregacionId) return 'local';
    const { error: err } = await supabase.from('congregaciones').update({ meses_inactividad: n }).eq('id', congregacionId);
    if (err) {
      if (faltaColumna(err)) { setUmbralEnBD(false); return 'local'; }
      throw err;
    }
    setUmbralEnBD(true);
    return 'bd';
  };

  return { cargando: datos === null, error, filas, conteo, umbral, umbralEnBD, guardarUmbral, recargar: cargar };
}
