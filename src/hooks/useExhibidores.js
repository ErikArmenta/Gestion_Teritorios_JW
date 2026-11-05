import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useNotifications } from '../context/NotificationContext';
import { t as tx } from '../i18n';

// Lógica de Exhibidores, compartida por la vista 3D (Exhibidores3D, mapa de fondo) y la clásica
// (Exhibidores, respaldo sin WebGL2): crear exhibidor, asignar turnos, aceptar/rechazar/completar y eliminar.
// Los modales de asignar turno y eliminar están en components/ExhibidorModales.jsx.

export const ADMIN_ROLES_EXHIBIDORES = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

export const formatDate = (d) => {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatTime = (t) => (t ? t.substring(0, 5) : '');

const FORM_NUEVO = { nombre: '', descripcion: '', direccion: '' };

export default function useExhibidores() {
  const { user } = useAuth();
  const {
    exhibidores, exhibidorTurnos, usuarios,
    addExhibidor, deleteExhibidor,
    addExhibidorTurno, updateExhibidorTurno, deleteExhibidorTurno,
  } = useData();
  const toast = useToast();
  const { createNotification } = useNotifications();

  const isAdmin = ADMIN_ROLES_EXHIBIDORES.includes(user?.rol);
  const [activeTab, setActiveTab] = useState(isAdmin ? 'ubicaciones' : 'turnos');

  // --- Nuevo exhibidor ---
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState(FORM_NUEVO);
  const [newPosition, setNewPosition] = useState(null);
  const [savingNew, setSavingNew] = useState(false);

  // --- Asignar turno ---
  const [assignTarget, setAssignTarget] = useState(null); // exhibidor
  const [turnoForm, setTurnoForm] = useState({ usuario_id: '', fecha: '', hora_inicio: '', hora_fin: '', notas: '' });
  const [savingTurno, setSavingTurno] = useState(false);

  // --- Eliminar ---
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'exhibidor'|'turno', id, name }

  // Turnos del usuario logueado
  const misTurnos = useMemo(() => {
    if (!user) return [];
    return exhibidorTurnos
      .filter(t => Number(t.usuario_id) === Number(user.id))
      .sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  }, [exhibidorTurnos, user]);

  const today = new Date().toISOString().split('T')[0];

  // Turnos próximos de un exhibidor
  const getTurnosExhibidor = (exhibidorId) =>
    exhibidorTurnos.filter(t => Number(t.exhibidor_id) === Number(exhibidorId) && t.fecha >= today);

  // posicion opcional: la vista 3D manda el centro del mapa (pin) al guardar
  const crearExhibidor = async (posicion = newPosition) => {
    if (!posicion) { toast.error(tx('Haz click en el mapa para ubicar el exhibidor')); return false; }
    setSavingNew(true);
    try {
      await addExhibidor({
        nombre: newForm.nombre,
        descripcion: newForm.descripcion || null,
        direccion: newForm.direccion || null,
        latitud: posicion.lat,
        longitud: posicion.lng,
      });
      toast.success(tx('Exhibidor creado'));
      setShowNewForm(false);
      setNewForm(FORM_NUEVO);
      setNewPosition(null);
      return true;
    } catch (err) {
      toast.error(tx('Error: ') + (err.message || err));
      return false;
    } finally {
      setSavingNew(false);
    }
  };

  const handleCreateExhibidor = async (e) => {
    e.preventDefault();
    await crearExhibidor();
  };

  const abrirAsignar = (exh) => {
    setAssignTarget(exh);
    setTurnoForm({ usuario_id: '', fecha: today, hora_inicio: '09:00', hora_fin: '11:00', notas: '' });
  };

  const handleAssignTurno = async (e) => {
    e.preventDefault();
    if (!turnoForm.usuario_id || !turnoForm.fecha || !turnoForm.hora_inicio || !turnoForm.hora_fin) return;
    setSavingTurno(true);
    try {
      const turnoCreado = await addExhibidorTurno({
        exhibidor_id: assignTarget.id,
        usuario_id: Number(turnoForm.usuario_id),
        fecha: turnoForm.fecha,
        hora_inicio: turnoForm.hora_inicio,
        hora_fin: turnoForm.hora_fin,
        notas: turnoForm.notas || null,
      });
      try {
        await createNotification({
          usuario_destino_id: Number(turnoForm.usuario_id),
          tipo: 'exhibidor',
          titulo: 'Turno de exhibidor asignado',
          mensaje: `Se te asignó un turno en "${assignTarget.nombre}" el ${formatDate(turnoForm.fecha)} de ${formatTime(turnoForm.hora_inicio)} a ${formatTime(turnoForm.hora_fin)}`,
          metadata: {
            turno_id: turnoCreado.id,
            exhibidor_id: assignTarget.id,
            exhibidor_nombre: assignTarget.nombre,
            fecha: turnoForm.fecha,
            hora_inicio: turnoForm.hora_inicio,
            hora_fin: turnoForm.hora_fin,
            accion_requerida: 'confirmar_asistencia',
          },
        });
      } catch { /* la notificación no bloquea el turno */ }
      toast.success(tx('Turno asignado'));
      setAssignTarget(null);
      setTurnoForm({ usuario_id: '', fecha: '', hora_inicio: '', hora_fin: '', notas: '' });
    } catch (err) {
      toast.error(tx('Error: ') + (err.message || err));
    } finally {
      setSavingTurno(false);
    }
  };

  const handleTurnoAction = async (turno, accion) => {
    try {
      await updateExhibidorTurno(turno.id, { estado: accion });
      const exhibNombre = turno.exhibidores?.nombre || 'exhibidor';
      const fechaStr = formatDate(turno.fecha);
      const notifMap = {
        aceptado: { titulo: 'Turno aceptado', mensaje: `${user.nombre} acepto el turno en "${exhibNombre}" del ${fechaStr}` },
        rechazado: { titulo: 'Turno rechazado', mensaje: `${user.nombre} rechazo el turno en "${exhibNombre}" del ${fechaStr}` },
        completado: { titulo: 'Turno completado', mensaje: `${user.nombre} completo el turno en "${exhibNombre}" del ${fechaStr}` },
      };
      if (turno.asignado_por && notifMap[accion]) {
        try {
          await createNotification({
            usuario_destino_id: turno.asignado_por,
            tipo: 'exhibidor_respuesta',
            ...notifMap[accion],
          });
        } catch { /* la notificación no bloquea la respuesta */ }
      }
      toast.success(accion === 'aceptado' ? 'Turno aceptado' : accion === 'rechazado' ? 'Turno rechazado' : 'Turno completado');
    } catch (err) {
      toast.error(tx('Error: ') + (err.message || err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'exhibidor') await deleteExhibidor(deleteTarget.id);
      else await deleteExhibidorTurno(deleteTarget.id);
      toast.success(tx('Eliminado'));
    } catch (err) {
      toast.error(tx('Error: ') + (err.message || err));
    } finally {
      setDeleteTarget(null);
    }
  };

  // Centro del mapa: promedio de los exhibidores
  const mapCenter = useMemo(() => {
    if (exhibidores.length === 0) return [19.4326, -99.1332];
    const lat = exhibidores.reduce((s, e) => s + e.latitud, 0) / exhibidores.length;
    const lng = exhibidores.reduce((s, e) => s + e.longitud, 0) / exhibidores.length;
    return [lat, lng];
  }, [exhibidores]);

  return {
    user, isAdmin, usuarios, exhibidores, exhibidorTurnos, misTurnos, today, getTurnosExhibidor, mapCenter,
    activeTab, setActiveTab,
    showNewForm, setShowNewForm, newForm, setNewForm, newPosition, setNewPosition, savingNew,
    crearExhibidor, handleCreateExhibidor,
    assignTarget, setAssignTarget, turnoForm, setTurnoForm, savingTurno, abrirAsignar, handleAssignTurno,
    handleTurnoAction, deleteTarget, setDeleteTarget, handleDelete,
  };
}
