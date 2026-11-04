import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useGrupos } from '../context/GruposContext';
import { useToast } from '../components/Toast';
import { supabase } from '../supabaseClient';
import { getTerritoryProgress, indexarHistorial } from '../utils/territoryProgress';
import { t as tx } from '../i18n';

// Lógica de "Gestión de Territorios", compartida por la vista clásica (TerritoriosAdmin, Leaflet) y
// la 3D (TerritoriosAdmin3D, MapLibre): lista, progreso, crear / editar / eliminar y compartir.
// Los modales están en components/TerritorioModales.jsx.

export const FORM_VACIO = { numero: '', nombre: '', descripcion: '', color: '#3B82F6', responsable: '', congregacion_id_override: '' };

export default function useTerritoriosAdmin() {
  const { territorios, casas, asignaciones, usuarios, manzanas, addTerritorio, updateTerritorio, deleteTerritorio, loading } = useData();
  const { user } = useAuth();
  const { disponible: gruposDisponibles, grupos, trabajos, historial } = useGrupos();
  const toast = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [nuevo, setNuevo] = useState(null);         // coordenadas del polígono recién dibujado
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [editando, setEditando] = useState(null);   // territorio en edición
  const [formEdit, setFormEdit] = useState(FORM_VACIO);
  const [borrar, setBorrar] = useState(null);
  const [asignacionesDe, setAsignacionesDe] = useState(null);
  const [compartir, setCompartir] = useState(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [congregaciones, setCongregaciones] = useState([]);

  const pedirCongregacion = user?.rol === 'Super Admin' && !user?.congregacion_id;
  useEffect(() => {
    if (!pedirCongregacion) return;
    supabase.from('congregaciones').select('id, nombre').then(({ data }) => setCongregaciones(data || []));
  }, [pedirCongregacion]);

  const progreso = useMemo(() => {
    const ctx = { disponible: !!gruposDisponibles, trabajos, grupos, historialIdx: indexarHistorial(historial) };
    const map = {};
    territorios.forEach(t => { map[t.id] = getTerritoryProgress(t, casas, ctx); });
    return map;
  }, [territorios, casas, gruposDisponibles, trabajos, grupos, historial]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return territorios
      .filter(t => !q || `${t.numero || ''} ${t.nombre || ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.numero || a.nombre).localeCompare(String(b.numero || b.nombre), 'es', { numeric: true }));
  }, [territorios, busqueda]);

  const seleccionado = territorios.find(t => String(t.id) === String(seleccionadoId)) || null;

  const guardarNuevo = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formNuevo, coordenadas: nuevo };
      if (formNuevo.congregacion_id_override) payload.congregacion_id = formNuevo.congregacion_id_override;
      delete payload.congregacion_id_override;
      await addTerritorio(payload);
      setNuevo(null);
      setFormNuevo(FORM_VACIO);
      toast.success(tx('Territorio creado correctamente'));
    } catch (err) {
      toast.error(tx('Error al guardar: ') + (err.message || err));
    }
  };

  const abrirEdicion = (t) => {
    setEditando(t);
    setFormEdit({ numero: t.numero || '', nombre: t.nombre || '', descripcion: t.descripcion || '', color: t.color || '#3B82F6', responsable: t.responsable || '', congregacion_id_override: '' });
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      const { congregacion_id_override, ...datos } = formEdit; // eslint-disable-line no-unused-vars
      await updateTerritorio(editando.id, datos);
      setEditando(null);
      toast.success(tx('Territorio actualizado'));
    } catch (err) {
      toast.error(tx('Error al actualizar: ') + (err.message || err));
    }
  };

  // Nueva forma de un territorio. Se manda su propia congregación: updateTerritorio pondría la del
  // usuario y un Super Admin movería el territorio de congregación sin querer.
  const guardarForma = async (t, coordenadas) => {
    try {
      await updateTerritorio(t.id, { coordenadas, ...(t.congregacion_id ? { congregacion_id: t.congregacion_id } : {}) });
      toast.success(tx('Forma del territorio actualizada'));
      return true;
    } catch (err) {
      toast.error(tx('Error al actualizar: ') + (err.message || err));
      return false;
    }
  };

  const eliminar = async () => {
    try {
      await deleteTerritorio(borrar.id);
      toast.success(tx('Territorio "{nombre}" eliminado', { nombre: borrar.nombre }));
      if (String(seleccionadoId) === String(borrar.id)) setSeleccionadoId(null);
    } catch (err) {
      toast.error(tx('Error al eliminar: ') + (err.message || err));
    } finally {
      setBorrar(null);
    }
  };

  const generarEnlace = async (t) => {
    setCompartiendo(true);
    try {
      const { data, error } = await supabase
        .from('territorio_compartidos')
        .insert({ territorio_id: t.id, creado_por: user.id, expira_en: new Date(Date.now() + 86400000).toISOString() })
        .select('id')
        .single();
      if (error) throw error;
      setCompartir({ nombre: t.nombre, link: `${window.location.origin}/shared/${data.id}` });
    } catch (err) {
      toast.error(tx('Error al compartir: ') + (err.message || err));
    } finally {
      setCompartiendo(false);
    }
  };

  const nombreUsuario = (a) =>
    a.app_usuarios?.nombre || usuarios.find(u => String(u.id) === String(a.usuario_id))?.nombre || `#${a.usuario_id}`;

  return {
    territorios, casas, asignaciones, manzanas, loading, progreso, lista, seleccionado,
    busqueda, setBusqueda, seleccionadoId, setSeleccionadoId,
    nuevo, setNuevo, formNuevo, setFormNuevo, guardarNuevo,
    editando, setEditando, formEdit, setFormEdit, abrirEdicion, guardarEdicion, guardarForma,
    borrar, setBorrar, eliminar,
    asignacionesDe, setAsignacionesDe,
    compartir, setCompartir, compartiendo, generarEnlace,
    congregaciones, pedirCongregacion, nombreUsuario,
  };
}
