import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { offlineStore } from '../utils/offlineStore';
import { lunesDe, limpiarReuniones } from '../utils/aseo';

// Planeación del aseo del Salón de UNA congregación (Migración 17) + cambios de semanas.
// disponible: null = cargando, false = falta la migración, true = lista. Sin conexión usa la copia guardada.
const faltaTabla = (e) => ['PGRST205', '42P01'].includes(e?.code)
  || (/aseo_(planes|cambios)/.test(e?.message || '') && /not find|does not exist/i.test(e?.message || ''));

const SIN_CAMBIOS = [];

export function useAseo(congregacionId) {
  // Todo lo cargado lleva de qué congregación es: al cambiar de congregación no se muestran datos de la otra
  const [datos, setDatos] = useState({ para: null, disponible: null, plan: null, cambios: [] });
  const clave = `aseo:${congregacionId || 'ninguna'}`;

  const cargar = useCallback(async () => {
    if (!congregacionId) return;
    const poner = (cambio) => setDatos((d) => ({ ...d, para: congregacionId, ...cambio }));
    const restaurar = async () => {
      const c = await offlineStore.leerDatos(clave).catch(() => null);
      if (!c) return false;
      poner({ plan: c.plan || null, cambios: c.cambios || [], disponible: true });
      return true;
    };
    if (!navigator.onLine && (await restaurar())) return;
    // Solo las semanas de hace 4 en adelante (los cambios viejos ya no se usan)
    const desde = lunesDe(new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10));
    const [p, c] = await Promise.all([
      supabase.from('aseo_planes').select('*').eq('congregacion_id', congregacionId).maybeSingle(),
      supabase.from('aseo_cambios').select('*').eq('congregacion_id', congregacionId).gte('semana', desde).order('semana'),
    ]);
    if (p.error || c.error) {
      if (faltaTabla(p.error) || faltaTabla(c.error)) poner({ disponible: false });
      else if (!(await restaurar())) poner({ disponible: false });
      return;
    }
    poner({ plan: p.data || null, cambios: c.data || [], disponible: true });
    offlineStore.guardarDatos(clave, { plan: p.data || null, cambios: c.data || [] }).catch(() => {});
  }, [congregacionId, clave]);

  useEffect(() => { cargar(); }, [cargar]);
  const vigente = datos.para === congregacionId;
  const plan = vigente ? datos.plan : null;
  const cambios = vigente ? datos.cambios : SIN_CAMBIOS;
  const disponible = vigente ? datos.disponible : null;

  const revisar = ({ error }) => {
    if (error) throw new Error(/otra congregación/.test(error.message) ? error.message : (error.message || 'Error'));
  };

  const guardarPlan = async ({ reuniones, orden_grupos, inicio, avisos }) => {
    revisar(await supabase.from('aseo_planes').upsert([{
      congregacion_id: congregacionId,
      reuniones: limpiarReuniones(reuniones),
      orden_grupos: orden_grupos.map(Number),
      inicio: lunesDe(inicio),
      avisos: avisos !== false,
    }], { onConflict: 'congregacion_id' }));
    await cargar();
  };

  // Cambio de UNA semana: { semana (cualquier día), grupo_id | null, sin_aseo, reuniones | null, nota }
  const guardarCambio = async ({ semana, grupo_id, sin_aseo, reuniones, nota }) => {
    revisar(await supabase.from('aseo_cambios').upsert([{
      congregacion_id: congregacionId,
      semana: lunesDe(semana),
      grupo_id: sin_aseo ? null : (grupo_id ? Number(grupo_id) : null),
      sin_aseo: !!sin_aseo,
      reuniones: reuniones?.length ? limpiarReuniones(reuniones) : null,
      nota: nota?.trim() ? nota.trim().slice(0, 200) : null,
    }], { onConflict: 'congregacion_id,semana' }));
    await cargar();
  };

  // Borrar: el tiempo real no avisa DELETE en canales filtrados → quitarlo del estado aquí
  const quitarCambio = async (semana) => {
    revisar(await supabase.from('aseo_cambios').delete().eq('congregacion_id', congregacionId).eq('semana', lunesDe(semana)));
    setDatos((d) => ({ ...d, cambios: d.cambios.filter((c) => String(c.semana).slice(0, 10) !== lunesDe(semana)) }));
    await cargar();
  };

  return { disponible, plan, cambios, guardarPlan, guardarCambio, quitarCambio, recargar: cargar };
}
