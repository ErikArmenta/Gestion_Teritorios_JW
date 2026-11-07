import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { mesesDelAnio } from '../utils/s21';

// Datos para el S-21 de un año de servicio: miembros activos, sus datos del registro (publicador_registro,
// Migración 15) y sus informes de septiembre a agosto. Filtrado por la congregación del usuario.

const paginado = async (armar) => {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) return { data: filas, error };
    filas.push(...(data || []));
    if (!data || data.length < 1000) return { data: filas, error: null };
  }
};

export default function useRegistroS21(anio, activo = true) {
  const { user } = useAuth();
  const congregacionId = user?.congregacion_id || null;
  const [estado, setEstado] = useState({ cargando: true, disponible: true, miembros: [], registros: {}, informes: {}, error: null });

  const cargar = useCallback(async () => {
    if (!user || !activo) return;
    setEstado((e) => ({ ...e, cargando: true }));
    const meses = mesesDelAnio(anio);
    const porCong = (q) => (congregacionId ? q.eq('congregacion_id', congregacionId) : q);
    const [miembrosRes, informesRes] = await Promise.all([
      porCong(supabase.from('app_usuarios').select('id, nombre, rol, tipo_publicador, activo')).order('nombre'),
      paginado(() => porCong(supabase.from('informes_servicio')
        .select('usuario_id, mes, tipo_publicador, predico, estudios, horas, horas_servicio_sagrado, comentarios'))
        .gte('mes', meses[0]).lte('mes', meses[11]).order('id')),
    ]);
    if (miembrosRes.error) { setEstado((e) => ({ ...e, cargando: false, error: miembrosRes.error })); return; }
    const miembros = (miembrosRes.data || []).filter((m) => m.activo !== false);
    // Datos personales: de 100 en 100 (lista de ids en la URL)
    const registros = {};
    let disponible = true;
    for (let i = 0; i < miembros.length; i += 100) {
      const ids = miembros.slice(i, i + 100).map((m) => m.id);
      const { data, error } = await supabase.from('publicador_registro').select('*').in('usuario_id', ids);
      if (error) { disponible = false; break; }
      (data || []).forEach((r) => { registros[r.usuario_id] = r; });
    }
    const informes = {};
    (informesRes.data || []).forEach((inf) => {
      ((informes[inf.usuario_id] ??= {}))[String(inf.mes).slice(0, 10)] = inf;
    });
    setEstado({ cargando: false, disponible, miembros, registros, informes, error: informesRes.error || null });
  }, [user, activo, anio, congregacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Guardar los datos de una persona (los vacíos se guardan como null)
  const guardar = useCallback(async (usuarioId, datos) => {
    const fila = { usuario_id: usuarioId };
    ['sexo', 'fecha_nacimiento', 'fecha_bautismo', 'esperanza', 'nombramiento', 'servicio_especial']
      .forEach((k) => { fila[k] = datos[k] || null; });
    const { error } = await supabase.from('publicador_registro').upsert(fila, { onConflict: 'usuario_id' });
    if (error) throw error;
    setEstado((e) => ({ ...e, registros: { ...e.registros, [usuarioId]: { ...(e.registros[usuarioId] || {}), ...fila } } }));
  }, []);

  return { ...estado, guardar, recargar: cargar };
}
