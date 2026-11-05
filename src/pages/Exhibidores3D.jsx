import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Plus, Clock, Calendar, Trash2, X, Check, MapPinned, Loader2, ArrowLeft } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useMapaPagina } from '../context/MapaFondoContext';
import PanelMapa from '../components/PanelMapa';
import ExhibidorIcon from '../components/ExhibidorIcon';
import { BadgeTurno, TarjetaMiTurno, ModalesExhibidor } from '../components/ExhibidorPiezas';
import useExhibidores, { formatDate, formatTime } from '../hooks/useExhibidores';
import { maplibregl, poligonosGeoJSON, crearPinCentro, limitesDe, crearMarcadorExhibidor } from '../utils/map3d';
import { t as tx } from '../i18n';

// Exhibidores en 3D: usa el mapa de fondo compartido (context/MapaFondoContext.jsx). Los exhibidores
// son marcadores en el mapa; el panel (abajo en móvil, en el menú flotante en escritorio) tiene las
// pestañas Ubicaciones (admins) y Mis Turnos. Nuevo exhibidor: pin al centro del mapa + formulario.
// Lógica compartida con la vista clásica: hooks/useExhibidores.js y components/ExhibidorPiezas.jsx

const Exhibidores3D = () => {
  const ex = useExhibidores();
  const {
    isAdmin, exhibidores, misTurnos, getTurnosExhibidor,
    activeTab, setActiveTab, newForm, setNewForm, savingNew, crearExhibidor,
    abrirAsignar, handleTurnoAction, setDeleteTarget,
  } = ex;
  const { territorios } = useData();

  const [selId, setSelId] = useState(null);     // exhibidor abierto
  const [creando, setCreando] = useState(false); // nuevo exhibidor: pin al centro
  const [expandido, setExpandido] = useState(false);
  const marcadoresRef = useRef([]);
  const encuadradoRef = useRef(false);
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id');
  const idUsadoRef = useRef(false);

  const sel = exhibidores.find(e => String(e.id) === String(selId)) || null;
  const activos = useMemo(() => exhibidores.filter(e => e.activo !== false), [exhibidores]);

  // Territorios de fondo (contexto), sin casas
  const datos = useMemo(() => ({ territorios: poligonosGeoJSON(territorios, '#2563EB', () => ({ relleno: 0.06 })) }), [territorios]);
  const { mapRef, listo } = useMapaPagina({ datos, alCrear: () => undefined });

  const volarA = (exh) => {
    const lat = Number(exh.latitud); const lng = Number(exh.longitud);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current?.easeTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 16.5), duration: 700 });
    }
  };

  const abrir = (exh) => {
    setCreando(false);
    setSelId(exh.id);
    setActiveTab('ubicaciones');
    volarA(exh);
  };

  // Marcadores de los exhibidores
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return undefined;
    marcadoresRef.current = activos.flatMap(exh => {
      const lat = Number(exh.latitud); const lng = Number(exh.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const el = crearMarcadorExhibidor(exh, String(exh.id) === String(selId), () => abrir(exh));
      return [new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)];
    });
    return () => { marcadoresRef.current.forEach(m => m.remove()); marcadoresRef.current = []; };
    // abrir cambia en cada render; los marcadores solo se rehacen cuando cambian los datos o la selección
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, activos, selId, mapRef]);

  // ?id=X desde el mapa principal ("Ver turnos"): abrir ese exhibidor
  useEffect(() => {
    if (!idParam || !listo || idUsadoRef.current) return undefined;
    const exh = exhibidores.find(e => String(e.id) === String(idParam));
    if (!exh) return undefined;
    idUsadoRef.current = true;
    encuadradoRef.current = true; // no encuadrar todos: se vuela a este
    const timer = setTimeout(() => abrir(exh), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, listo, exhibidores]);

  // Encuadre inicial: los exhibidores (o los territorios si no hay)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || encuadradoRef.current) return;
    const puntos = {
      type: 'FeatureCollection',
      features: activos
        .filter(e => Number.isFinite(Number(e.latitud)) && Number.isFinite(Number(e.longitud)))
        .map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(e.longitud), Number(e.latitud)] }, properties: {} })),
    };
    const limites = limitesDe(puntos.features.length ? puntos : datos.territorios);
    if (!limites) return;
    encuadradoRef.current = true;
    map.fitBounds(limites, { padding: 60, maxZoom: 16, duration: 0 });
  }, [listo, activos, datos.territorios, mapRef]);

  // Nuevo exhibidor: pin fijo al centro mientras se llena el formulario
  useEffect(() => {
    const map = mapRef.current;
    if (!creando || !map || !listo) return undefined;
    return crearPinCentro(map);
  }, [creando, listo, mapRef]);

  const guardarNuevo = async (e) => {
    e.preventDefault();
    const c = mapRef.current?.getCenter();
    if (!c) return;
    const ok = await crearExhibidor({ lat: c.lat, lng: c.lng });
    if (ok) setCreando(false);
  };

  const renderNuevo = () => (
    <form onSubmit={guardarNuevo} className="m3d-scroll">
      <div className="m3d-fila justify-between">
        <h2 className="m3d-h2">{tx('Nuevo Exhibidor')}</h2>
        <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => setCreando(false)} aria-label={tx('Cancelar')}><X size={16} /></button>
      </div>
      <p className="text-xs text-secondary m-0">{tx('Mueve el mapa hasta que el pin quede en el lugar del exhibidor.')}</p>
      <input className="m3d-input" required value={newForm.nombre} onChange={e => setNewForm({ ...newForm, nombre: e.target.value })} placeholder={tx('Nombre *')} />
      <input className="m3d-input" value={newForm.direccion} onChange={e => setNewForm({ ...newForm, direccion: e.target.value })} placeholder={tx('Direccion')} />
      <textarea className="m3d-input" rows={2} value={newForm.descripcion} onChange={e => setNewForm({ ...newForm, descripcion: e.target.value })} placeholder={tx('Detalles del exhibidor...')} />
      <div className="m3d-acciones">
        <button type="submit" className="btn btn-primary flex-1" disabled={savingNew}>
          {savingNew ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {tx('Crear Exhibidor')}
        </button>
      </div>
    </form>
  );

  const renderFicha = () => {
    const turnos = getTurnosExhibidor(sel.id);
    const lat = Number(sel.latitud); const lng = Number(sel.longitud);
    return (
      <div className="m3d-scroll">
        <div className="m3d-fila justify-between">
          <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
            <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => setSelId(null)} aria-label={tx('Volver')}><ArrowLeft size={16} /></button>
            <span className="m3d-item__color" style={{ background: sel.color || '#F59E0B', borderRadius: 9999 }} />
            <span className="truncate">{sel.nombre}</span>
          </h2>
        </div>
        {sel.direccion && <p className="text-sm text-secondary m-0">{sel.direccion}</p>}
        {sel.descripcion && <p className="text-xs text-muted m-0">{sel.descripcion}</p>}

        <p className="m3d-etiqueta">{tx('Turnos próximos')} ({turnos.length})</p>
        {turnos.length === 0 && <p className="text-xs text-muted m-0">{tx('Sin turnos próximos')}</p>}
        {turnos.map(tu => (
          <div key={tu.id} className="m3d-item" style={{ cursor: 'default' }}>
            <span className="min-w-0 flex-1">
              <span className="m3d-item__titulo" style={{ marginBottom: 2 }}>{tu.usuario?.nombre || tx('Usuario')}</span>
              <span className="m3d-item__sub">{formatDate(tu.fecha)} · {formatTime(tu.hora_inicio)}-{formatTime(tu.hora_fin)}</span>
            </span>
            <BadgeTurno estado={tu.estado} />
            {isAdmin && (
              <button
                type="button"
                className="m3d-btn-icono m3d-btn-icono--sm"
                style={{ color: '#DC2626' }}
                onClick={() => setDeleteTarget({ type: 'turno', id: tu.id, name: `turno de ${tu.usuario?.nombre || 'usuario'}` })}
                aria-label={tx('Eliminar')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        <div className="m3d-acciones m3d-acciones--wrap">
          {isAdmin && (
            <button type="button" className="m3d-accion m3d-accion--azul" onClick={() => abrirAsignar(sel)}>
              <Calendar size={15} /> {tx('Asignar Turno')}
            </button>
          )}
          {Number.isFinite(lat) && Number.isFinite(lng) && (
            <a
              className="m3d-accion"
              href={`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPinned size={15} /> {tx('Cómo llegar')}
            </a>
          )}
          {isAdmin && (
            <button type="button" className="m3d-accion m3d-accion--roja" onClick={() => setDeleteTarget({ type: 'exhibidor', id: sel.id, name: sel.nombre })}>
              <Trash2 size={15} /> {tx('Eliminar')}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderUbicaciones = () => (
    <>
      <div className="m3d-fila justify-between">
        <span className="text-xs font-semibold text-muted">{tx('{n} exhibidores', { n: exhibidores.length })}</span>
        {isAdmin && (
          <button type="button" className="m3d-accion m3d-accion--azul" style={{ flex: '0 0 auto' }} onClick={() => { setSelId(null); setCreando(true); }} disabled={!listo}>
            <Plus size={15} /> {tx('Nuevo Exhibidor')}
          </button>
        )}
      </div>
      <div className={`m3d-lista${expandido ? ' is-open' : ''}`}>
        {exhibidores.length === 0 && <p className="text-sm text-secondary m-0 py-2">{tx('No hay exhibidores registrados')}</p>}
        {exhibidores.map(exh => {
          const n = getTurnosExhibidor(exh.id).length;
          return (
            <button key={exh.id} type="button" className="m3d-item" onClick={() => abrir(exh)}>
              <span className="m3d-item__color" style={{ background: exh.color || '#F59E0B', borderRadius: 9999 }} />
              <span className="min-w-0 flex-1">
                <span className="m3d-item__titulo" style={{ marginBottom: 2 }}>{exh.nombre}</span>
                <span className="m3d-item__sub">{exh.direccion || tx('Sin dirección')} · {tx('{n} turnos próximos', { n })}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const renderMisTurnos = () => (
    <div className={`m3d-lista${expandido ? ' is-open' : ''}`} style={{ gap: 10 }}>
      {misTurnos.length === 0 ? (
        <p className="text-sm text-secondary m-0 py-2 flex items-center gap-2"><Clock size={16} /> {tx('No tienes turnos asignados')}</p>
      ) : misTurnos.map(turno => <TarjetaMiTurno key={turno.id} turno={turno} onAccion={handleTurnoAction} />)}
    </div>
  );

  let contenido;
  if (creando) contenido = renderNuevo();
  else if (sel) contenido = renderFicha();
  else contenido = (
    <>
      <div className="m3d-estados m3d-estados--libre">
        {isAdmin && (
          <button type="button" className={`m3d-estado${activeTab === 'ubicaciones' ? ' is-sel' : ''}`} onClick={() => setActiveTab('ubicaciones')}>
            <MapPin size={14} /> {tx('Ubicaciones')}
          </button>
        )}
        <button type="button" className={`m3d-estado${activeTab === 'turnos' ? ' is-sel' : ''}`} onClick={() => setActiveTab('turnos')}>
          <Clock size={14} /> {tx('Mis Turnos')}{misTurnos.length ? ` (${misTurnos.length})` : ''}
        </button>
      </div>
      {activeTab === 'ubicaciones' && isAdmin ? renderUbicaciones() : renderMisTurnos()}
      <button type="button" className="m3d-link self-start" onClick={() => setExpandido(v => !v)}>
        {expandido ? tx('Ver menos') : tx('Ver más')}
      </button>
    </>
  );

  return (
    <>
      <PanelMapa
        abierto={expandido}
        cabecera={(
          <div className="m3d-titulo">
            <span className="m3d-titulo__icono"><ExhibidorIcon size={16} /></span>
            <div className="min-w-0">
              <p className="m3d-titulo__texto">{tx('Exhibidores')}</p>
              <p className="m3d-titulo__sub">{creando ? tx('Mueve el mapa para ubicarlo') : tx('Toca un exhibidor en el mapa')}</p>
            </div>
          </div>
        )}
      >
        <button type="button" className="m3d-sheet__asa" onClick={() => setExpandido(v => !v)} aria-label={expandido ? tx('Ver menos') : tx('Ver más')}>
          <span />
        </button>
        {contenido}
      </PanelMapa>

      <ModalesExhibidor ex={ex} />
    </>
  );
};

export default Exhibidores3D;
