import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { offlineStore } from '../utils/offlineStore';
import { finDeMes, totalesDe, TIPOS_PUBLICADOR } from '../utils/informes';

// Resumen de informes de la congregación (ancianos, ministeriales y admins) para un mes.
// Una fila por miembro activo: lo que envió o, si aún no envía, lo que lleva anotado (precursores).
// Siempre filtrado por la congregación del usuario (Super Admin sin congregación ve todas).

export default function useInformesCongregacion(mes, activo = true) {
  const { user } = useAuth();
  const { isOnline } = useData();
  // `mes` dentro del estado = mes ya cargado; si no coincide con el pedido, está cargando
  const [estado, setEstado] = useState({ mes: null, miembros: [], informes: [], registros: [] });
  const congregacionId = user?.congregacion_id || null;
  const clave = `informes-cong:${congregacionId || 'todas'}:${mes}`;

  const porCongregacion = useCallback((q) => (congregacionId ? q.eq('congregacion_id', congregacionId) : q), [congregacionId]);

  const cargar = useCallback(async () => {
    if (!user || !activo) return;
    if (!navigator.onLine) {
      const cache = await offlineStore.leerDatos(clave).catch(() => null);
      setEstado({ mes, ...(cache || { miembros: [], informes: [], registros: [] }) });
      return;
    }
    const [miembrosRes, informesRes, registrosRes] = await Promise.all([
      porCongregacion(supabase.from('app_usuarios').select('id, nombre, rol, tipo_publicador, activo, grupo_id')).order('nombre'),
      porCongregacion(supabase.from('informes_servicio').select('*')).eq('mes', mes),
      porCongregacion(supabase.from('registros_servicio').select('usuario_id, categoria, tipo, horas, revisitas'))
        .gte('fecha', mes).lte('fecha', finDeMes(mes)),
    ]);
    const datos = {
      miembros: (miembrosRes.data || []).filter(m => m.activo !== false),
      informes: informesRes.data || [],
      registros: registrosRes.data || [],
    };
    setEstado({ mes, error: miembrosRes.error || informesRes.error || registrosRes.error || null, ...datos });
    offlineStore.guardarDatos(clave, datos).catch(() => {});
  }, [user, activo, mes, clave, porCongregacion]);

  useEffect(() => { cargar(); }, [cargar, isOnline]);

  const filas = useMemo(() => estado.miembros.map(m => {
    const inf = estado.informes.find(i => String(i.usuario_id) === String(m.id));
    const tipo = inf?.tipo_publicador || m.tipo_publicador || 'Publicador';
    const propios = totalesDe(estado.registros.filter(r => String(r.usuario_id) === String(m.id)));
    return {
      id: m.id,
      nombre: m.nombre,
      tipo,
      enviado: !!inf,
      enviadoEn: inf?.enviado_en || null,
      predico: inf ? inf.predico : propios.horas > 0,
      estudios: inf?.estudios ?? 0,
      horas: inf ? Number(inf.horas) : propios.horas,
      revisitas: inf ? inf.revisitas : propios.revisitas,
      servicioSagrado: inf ? Number(inf.horas_servicio_sagrado) : propios.servicioSagrado,
      comentarios: inf?.comentarios || '',
      porTipo: propios.porTipo, // desglose por concepto (de las salidas anotadas)
    };
  }), [estado]);

  // Totales por tipo (como el informe de la congregación)
  const resumen = useMemo(() => Object.fromEntries(TIPOS_PUBLICADOR.map(tipo => {
    const grupo = filas.filter(f => f.tipo === tipo);
    const enviados = grupo.filter(f => f.enviado);
    return [tipo, {
      total: grupo.length,
      enviados: enviados.length,
      predicaron: enviados.filter(f => f.predico).length,
      horas: enviados.reduce((s, f) => s + f.horas, 0),
      estudios: enviados.reduce((s, f) => s + f.estudios, 0),
      revisitas: enviados.reduce((s, f) => s + f.revisitas, 0),
      servicioSagrado: enviados.reduce((s, f) => s + f.servicioSagrado, 0),
    }];
  })), [filas]);

  return { ...estado, cargando: estado.mes !== mes, filas, resumen, recargar: cargar };
}
