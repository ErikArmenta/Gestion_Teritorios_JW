import { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useGrupos } from '../context/GruposContext';
import { getTerritoryProgress, indexarHistorial } from '../utils/territoryProgress';

// Lógica del mapa principal, compartida por la vista clásica (TerritoriesMap, Leaflet) y la 3D
// (TerritoriesMap3D, MapLibre): filtro "Mis territorios", progreso, búsqueda y ruta de visitas.

export const ADMIN_ROLES = ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'];

const distEuclidiana = (a, b) =>
  Math.sqrt((a.latitud - b.latitud) ** 2 + (a.longitud - b.longitud) ** 2);

export const calcularRutaNN = (casasPendientes, startLat = null, startLng = null) => {
  if (!casasPendientes.length) return [];
  const pending = [...casasPendientes];
  const ordered = [];

  if (startLat !== null && startLng !== null) {
    const startPoint = { latitud: startLat, longitud: startLng };
    let minDist = Infinity, minIdx = 0;
    pending.forEach((c, i) => {
      const d = distEuclidiana(startPoint, c);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    ordered.push(pending[minIdx]);
    pending.splice(minIdx, 1);
  } else {
    ordered.push(pending.shift());
  }

  while (pending.length > 0) {
    const current = ordered[ordered.length - 1];
    let minDist = Infinity, minIdx = 0;
    pending.forEach((c, i) => {
      const d = distEuclidiana(current, c);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    ordered.push(pending[minIdx]);
    pending.splice(minIdx, 1);
  }

  return ordered;
};

export const generarUrlGoogleMaps = (casasOrdenadas) => {
  if (!casasOrdenadas.length) return '#';
  const waypoints = casasOrdenadas.map(c => `${Number(c.latitud).toFixed(6)},${Number(c.longitud).toFixed(6)}`);
  return `https://www.google.com/maps/dir/${waypoints.join('/')}`;
};

export default function useMapaPrincipal() {
  const { territorios, casas, asignaciones, usuarios, loading, manzanas } = useData();
  const { user } = useAuth();
  const esAdmin = ADMIN_ROLES.includes(user?.rol);

  const [filtroMisTerr, setFiltroMisTerr] = useState(false);
  const [modoProgreso, setModoProgreso] = useState(false);
  const filtroInitialized = useRef(false);
  const [rutaActiva, setRutaActiva] = useState(null); // { territorioId, casasOrdenadas, polylinePoints }

  // Búsqueda en mapa
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);

  useEffect(() => {
    if (filtroInitialized.current) return;
    if (asignaciones.length === 0) return;
    filtroInitialized.current = true;
    if (user?.rol === 'Publicador') {
      const tieneAsignaciones = asignaciones.some(
        a => String(a.usuario_id) === String(user.id) && a.activa
      );
      setFiltroMisTerr(tieneAsignaciones);
    }
  }, [asignaciones, user]);

  const { disponible: gruposDisponibles, grupos, trabajos, historial, miGrupo } = useGrupos();

  // "Mis territorios" = asignados a mí o que mi grupo está trabajando ahora.
  // useMemo: un array nuevo en cada render disparaba efectos en bucle (la app se redibujaba sin
  // parar en "Mis territorios" y los toques en el popup se perdían).
  const territoriosFiltrados = useMemo(() => (filtroMisTerr
    ? territorios.filter(t =>
        asignaciones.some(
          a => String(a.territorio_id) === String(t.id) && String(a.usuario_id) === String(user?.id) && a.activa
        )
        || (miGrupo && trabajos.some(
          tr => String(tr.territorio_id) === String(t.id) && String(tr.grupo_id) === String(miGrupo.id) && tr.estado === 'en_progreso'
        ))
      )
    : territorios), [filtroMisTerr, territorios, asignaciones, user?.id, miGrupo, trabajos]);

  // Progreso de cada territorio (trabajo de grupos + % casas visitadas)
  const progresoPorTerritorio = useMemo(() => {
    const ctx = { disponible: !!gruposDisponibles, trabajos, grupos, historialIdx: indexarHistorial(historial) };
    const map = {};
    territorios.forEach(t => { map[t.id] = getTerritoryProgress(t, casas, ctx); });
    return map;
  }, [territorios, casas, gruposDisponibles, trabajos, grupos, historial]);

  const casasFiltradas = useMemo(() => (filtroMisTerr
    ? casas.filter(c => territoriosFiltrados.some(t => String(t.id) === String(c.territorio_id)))
    : casas), [filtroMisTerr, casas, territoriosFiltrados]);

  // Debounce búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setBusquedaDebounced(busqueda.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Filtrar resultados según busquedaDebounced
  useEffect(() => {
    if (!busquedaDebounced) {
      setResultadosBusqueda(prev => (prev.length ? [] : prev)); // no crear [] nuevo si ya está vacío
      return;
    }
    const q = busquedaDebounced.toLowerCase();
    const encontrados = casasFiltradas.filter(c =>
      (c.direccion || '').toLowerCase().includes(q) ||
      (c.nombre_contacto || '').toLowerCase().includes(q) ||
      (c.territorio_nombre || '').toLowerCase().includes(q)
    ).slice(0, 8);
    setResultadosBusqueda(encontrados);
  }, [busquedaDebounced, casasFiltradas]);

  const iniciarRuta = (territorioId) => {
    const pendientes = casas.filter(
      c => String(c.territorio_id) === String(territorioId) && c.estado === 'Pendiente'
        && c.latitud && c.longitud
    );
    if (!pendientes.length) return;

    const fijarRuta = (ordenadas) => setRutaActiva({
      territorioId,
      casasOrdenadas: ordenadas,
      polylinePoints: ordenadas.map(c => [Number(c.latitud), Number(c.longitud)]),
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fijarRuta(calcularRutaNN(pendientes, pos.coords.latitude, pos.coords.longitude)),
        () => fijarRuta(calcularRutaNN(pendientes)),
        { timeout: 3000 }
      );
    } else {
      fijarRuta(calcularRutaNN(pendientes));
    }
  };

  // Nombres de los asignados activos de un territorio
  const asignadosDe = (territorioId) => asignaciones
    .filter(a => String(a.territorio_id) === String(territorioId) && a.activa)
    .map(a => a.app_usuarios?.nombre || usuarios.find(u => String(u.id) === String(a.usuario_id))?.nombre || `#${a.usuario_id}`);

  return {
    territorios, casas, manzanas, asignaciones, usuarios, loading, user, esAdmin, miGrupo,
    filtroMisTerr, setFiltroMisTerr, modoProgreso, setModoProgreso,
    territoriosFiltrados, casasFiltradas, progresoPorTerritorio,
    busqueda, setBusqueda, busquedaDebounced, resultadosBusqueda,
    rutaActiva, setRutaActiva, iniciarRuta, asignadosDe,
  };
}
