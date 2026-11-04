import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as turf from '@turf/turf';
import {
  Plus, Search, X, Pencil, Trash2, Users, Grid2x2, Share2, Shapes, Square, Pentagon, RotateCcw, Check, ArrowLeft,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import NotificationBell from '../components/NotificationBell';
import BotonesMapa3D from '../components/BotonesMapa3D';
import TerritorioTrabajo from '../components/TerritorioTrabajo';
import TerritorioModales from '../components/TerritorioModales';
import useMapa3D, { leerPrefs3D, guardarPrefs3D, PITCH_3D } from '../hooks/useMapa3D';
import useTerritoriosAdmin from '../hooks/useTerritoriosAdmin';
import { PROGRESO } from '../utils/territoryProgress';
import { poligonosGeoJSON, casasBloquesGeoJSON, casasPuntosGeoJSON, limitesDe, anilloGeoJSON } from '../utils/map3d';
import { crearDibujo, editarForma, coordsDesdeFeature } from '../utils/dibujo3d';
import { t } from '../i18n';

// Gestión de Territorios en móvil: mapa 3D a pantalla completa + panel inferior.
// Lista de territorios → ficha (progreso y grupo, editar datos, editar forma, manzanas, asignaciones,
// compartir, eliminar) → manzanas en el mismo mapa (dibujar, editar forma, eliminar).
// Al dibujar o editar una forma el mapa se pone plano (vista desde arriba) y al terminar regresa.
// Lógica y modales compartidos con la vista clásica: hooks/useTerritoriosAdmin.js, components/TerritorioModales.jsx

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const nombreTerritorio = (te) =>
  [te.numero && String(te.numero) !== String(te.nombre) ? te.numero : null, te.nombre].filter(Boolean).join(' · ');

// Nombre sugerido para la siguiente manzana: número del territorio + letra (4A, 4B…)
const sugerenciaManzana = (te, manzanasTerr) => `${te.numero || te.nombre || ''}${LETRAS[manzanasTerr.length] || manzanasTerr.length + 1}`;

// ¿Todos los vértices de la manzana caen dentro (o en el borde) del territorio?
const manzanaDentro = (coordsManzana, territorio) => {
  const anilloT = anilloGeoJSON(territorio?.coordenadas);
  if (!anilloT) return true; // territorio sin polígono: no hay contra qué comparar
  const poli = turf.polygon([anilloT]);
  return coordsManzana.every(([lat, lng]) => turf.booleanPointInPolygon(turf.point([lng, lat]), poli));
};

const INSTRUCCIONES = {
  polygon: 'Toca el mapa en cada esquina. Para cerrar, toca el primer punto (amarillo).',
  rectangle: 'Toca una esquina y luego la esquina opuesta.',
  forma: 'Arrastra los puntos amarillos para mover las esquinas. Arrastra un punto blanco para agregar una esquina.',
};

const TerritoriosAdmin3D = ({ onVistaClasica }) => {
  const admin = useTerritoriosAdmin();
  const {
    territorios, casas, asignaciones, manzanas, loading, progreso, lista,
    busqueda, setBusqueda, seleccionadoId, setSeleccionadoId, setNuevo,
    abrirEdicion, guardarForma, setBorrar, setAsignacionesDe, compartiendo, generarEnlace, nombreUsuario,
  } = admin;
  const { addManzana, updateManzana, deleteManzana } = useData();
  const { theme } = useTheme();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const mapDivRef = useRef(null);
  const drawRef = useRef(null);
  const sesionRef = useRef(null);
  const encuadradoRef = useRef(false);
  const idParamUsadoRef = useRef(false);
  const alTerminarRef = useRef(null);
  const cancelarRef = useRef(null);

  const [prefs, setPrefs] = useState(leerPrefs3D);
  const oscuro = theme === 'dark';

  const [panel, setPanel] = useState('lista'); // lista | territorio | manzanas
  const [expandido, setExpandido] = useState(false);
  const [sesion, setSesion] = useState(null);   // { tipo, modo, territorioId, manzanaId, featureId }
  const [manzanaNueva, setManzanaNueva] = useState(null); // { territorioId, coords, nombre }
  const [guardando, setGuardando] = useState(false);
  const [confirmarFuera, setConfirmarFuera] = useState(null); // acción a confirmar
  const [borrarManzana, setBorrarManzana] = useState(null);

  const terrSel = territorios.find(te => String(te.id) === String(seleccionadoId)) || null;
  const manzanasTerr = useMemo(
    () => (terrSel ? manzanas.filter(m => String(m.territorio_id) === String(terrSel.id)) : []),
    [manzanas, terrSel]
  );

  // ── Datos del mapa (lo que se está editando se oculta: lo dibuja Terra Draw) ──
  const editandoTerrId = sesion?.tipo === 'territorio-forma' ? String(sesion.territorioId) : null;
  const editandoManzId = sesion?.tipo === 'manzana-forma' ? String(sesion.manzanaId) : null;

  const territoriosGJ = useMemo(() => poligonosGeoJSON(
    territorios.filter(te => String(te.id) !== editandoTerrId),
    '#3B82F6',
    (te) => {
      const p = progreso[te.id];
      const activo = String(te.id) === String(seleccionadoId);
      return {
        colorRelleno: PROGRESO[p?.estado]?.color || '#94A3B8',
        relleno: 0.12 + ((p?.pct || 0) / 100) * 0.35 + (activo ? 0.15 : 0),
        etiqueta: nombreTerritorio(te) + (p ? `\n${p.pct}%` : ''),
      };
    }
  ), [territorios, progreso, seleccionadoId, editandoTerrId]);

  const manzanasGJ = useMemo(() => {
    const colorDe = {};
    territorios.forEach(te => { colorDe[String(te.id)] = te.color; });
    return poligonosGeoJSON(
      manzanas.filter(m => String(m.id) !== editandoManzId),
      '#94A3B8',
      (m) => ({ color: m.color || colorDe[String(m.territorio_id)] || '#94A3B8' })
    );
  }, [manzanas, territorios, editandoManzId]);

  const casasBloques = useMemo(() => casasBloquesGeoJSON(casas), [casas]);
  const casasPuntos = useMemo(() => casasPuntosGeoJSON(casas), [casas]);

  const datos = useMemo(() => ({
    territorios: territoriosGJ, manzanas: manzanasGJ, 'casas-bloques': casasBloques, 'casas-puntos': casasPuntos,
  }), [territoriosGJ, manzanasGJ, casasBloques, casasPuntos]);

  // ── Mapa ──
  const alCrear = (map) => {
    map.on('click', (e) => {
      if (sesionRef.current) return; // dibujando: los toques son para Terra Draw
      const terr = map.getLayer('territorios-relleno')
        ? map.queryRenderedFeatures(e.point, { layers: ['territorios-relleno'] })[0]
        : null;
      if (terr) {
        setSeleccionadoId(terr.properties.id);
        setPanel(p => (p === 'manzanas' ? 'manzanas' : 'territorio'));
      }
    });
    // Un cambio de estilo borra las capas de Terra Draw: se cancela la sesión en curso
    map.on('style.load', () => { if (sesionRef.current) cancelarRef.current?.(); });
  };

  const { mapRef, listo, sinConexion } = useMapa3D(mapDivRef, { prefs, oscuro, datos, alCrear, onFallo: onVistaClasica });

  const volarA = (coordenadas) => {
    const anillo = anilloGeoJSON(coordenadas);
    const limites = anillo && limitesDe(turf.polygon([anillo]));
    if (limites) mapRef.current?.fitBounds(limites, { padding: 40, maxZoom: 18, duration: 800 });
  };

  // Abrir sobre todos los territorios (una vez)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || encuadradoRef.current) return;
    const limites = limitesDe(territoriosGJ);
    if (!limites) return;
    encuadradoRef.current = true;
    map.fitBounds(limites, { padding: 40, maxZoom: 16, duration: 0 });
  }, [listo, territoriosGJ, mapRef]);

  // ?id=X desde el mapa principal ("Gestionar") → abrir ese territorio
  const idParam = searchParams.get('id');
  useEffect(() => {
    if (!idParam || !listo || idParamUsadoRef.current) return;
    const te = territorios.find(x => String(x.id) === String(idParam));
    if (!te) return;
    idParamUsadoRef.current = true;
    const timer = setTimeout(() => {
      setSeleccionadoId(te.id);
      setPanel('territorio');
      volarA(te.coordenadas);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, listo, territorios]);

  // Al salir de la pantalla, cerrar el dibujo
  useEffect(() => () => { try { drawRef.current?.stop(); } catch { /* el mapa ya no existe */ } }, []);

  const abrirTerritorio = (te) => {
    setSeleccionadoId(te.id);
    setPanel('territorio');
    setExpandido(false);
    volarA(te.coordenadas);
  };

  // ── Sesiones de dibujo ──
  const terminarSesion = () => {
    const draw = drawRef.current;
    drawRef.current = null;
    sesionRef.current = null;
    setSesion(null);
    // Fuera del evento de Terra Draw que la cerró
    setTimeout(() => { try { draw?.stop(); } catch { /* ya detenido */ } }, 0);
    mapRef.current?.easeTo({ pitch: prefs.tresD ? PITCH_3D : 0, duration: 600 });
  };

  const iniciarSesion = (s, coordsAEditar) => {
    const map = mapRef.current;
    if (!map || !listo) return;
    try { drawRef.current?.stop(); } catch { /* nada */ }
    // Dibujar inclinado es impreciso: vista desde arriba. Al editar una forma se encuadra con margen
    // extra para que ninguna esquina quede bajo los botones del mapa.
    const anillo = coordsAEditar && anilloGeoJSON(coordsAEditar);
    const limites = anillo && limitesDe(turf.polygon([anillo]));
    if (limites) {
      map.fitBounds(limites, { padding: { top: 150, bottom: 40, left: 70, right: 70 }, maxZoom: 19, pitch: 0, bearing: 0, duration: 500 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
    let draw;
    try {
      draw = crearDibujo(map, { onTerminar: (feature) => alTerminarRef.current?.(feature) });
    } catch (err) {
      console.error('Terra Draw:', err);
      toast.error(t('No se pudo iniciar el dibujo en este mapa'));
      return;
    }
    drawRef.current = draw;
    const nueva = { ...s };
    if (coordsAEditar) {
      const id = editarForma(draw, coordsAEditar);
      if (id == null) {
        toast.error(t('Esta forma no se puede editar (el polígono guardado no es válido). Dibuja una nueva.'));
        try { draw.stop(); } catch { /* nada */ }
        drawRef.current = null;
        return;
      }
      nueva.featureId = id;
    } else {
      draw.setMode(s.modo || 'polygon');
    }
    sesionRef.current = nueva;
    setSesion(nueva);
  };

  // Terminó de dibujar una figura nueva
  const alTerminar = (feature) => {
    const s = sesionRef.current;
    const coords = coordsDesdeFeature(feature);
    if (!s || !coords) return;
    if (s.tipo === 'territorio-nuevo') {
      terminarSesion();
      setNuevo(coords); // abre el formulario de siempre (TerritorioModales)
    } else if (s.tipo === 'manzana-nueva') {
      const te = territorios.find(x => String(x.id) === String(s.territorioId));
      const yaTiene = manzanas.filter(m => String(m.territorio_id) === String(s.territorioId));
      terminarSesion();
      setManzanaNueva({ territorioId: s.territorioId, coords, nombre: te ? sugerenciaManzana(te, yaTiene) : '' });
    }
  };

  // Terra Draw y el mapa llaman a estas funciones desde sus eventos: siempre la versión más reciente
  useEffect(() => {
    alTerminarRef.current = alTerminar;
    cancelarRef.current = terminarSesion;
  });

  const cambiarModo = (modo) => {
    if (!drawRef.current || !sesion) return;
    drawRef.current.clear();
    drawRef.current.setMode(modo);
    const nueva = { ...sesion, modo };
    sesionRef.current = nueva;
    setSesion(nueva);
  };

  const reiniciarDibujo = () => {
    if (!drawRef.current || !sesion) return;
    drawRef.current.clear();
    drawRef.current.setMode(sesion.modo || 'polygon');
  };

  const coordsEditadas = () => {
    const s = sesionRef.current;
    const f = s?.featureId != null ? drawRef.current?.getSnapshotFeature(s.featureId) : null;
    return coordsDesdeFeature(f);
  };

  const guardarFormaEditada = async (forzar = false) => {
    const s = sesionRef.current;
    const coords = coordsEditadas();
    if (!s || !coords) { toast.error(t('La forma no es válida')); return; }
    if (s.tipo === 'manzana-forma' && !forzar && !manzanaDentro(coords, terrSel)) {
      setConfirmarFuera(() => () => guardarFormaEditada(true));
      return;
    }
    setGuardando(true);
    try {
      if (s.tipo === 'territorio-forma') {
        const te = territorios.find(x => String(x.id) === String(s.territorioId));
        if (te && await guardarForma(te, coords)) terminarSesion();
      } else if (s.tipo === 'manzana-forma') {
        await updateManzana(Number(s.manzanaId), { coordenadas: coords });
        toast.success(t('Forma de la manzana actualizada'));
        terminarSesion();
      }
    } catch (err) {
      toast.error(t('Error al actualizar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const guardarManzanaNueva = async (forzar = false) => {
    if (!manzanaNueva?.nombre.trim()) { toast.warning(t('Escribe el nombre de la manzana')); return; }
    const te = territorios.find(x => String(x.id) === String(manzanaNueva.territorioId));
    if (!forzar && !manzanaDentro(manzanaNueva.coords, te)) {
      setConfirmarFuera(() => () => guardarManzanaNueva(true));
      return;
    }
    setGuardando(true);
    try {
      await addManzana({ territorio_id: manzanaNueva.territorioId, nombre: manzanaNueva.nombre.trim(), coordenadas: manzanaNueva.coords });
      toast.success(t('Manzana agregada'));
      setManzanaNueva(null);
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const eliminarManzana = async () => {
    try {
      await deleteManzana(borrarManzana.id);
      toast.success(t('Manzana eliminada'));
    } catch (err) {
      toast.error(t('Error al eliminar: ') + (err.message || err));
    } finally {
      setBorrarManzana(null);
    }
  };

  const cambiarPrefs = (cambio) => setPrefs(p => { const n = { ...p, ...cambio }; guardarPrefs3D(n); return n; });

  const numCasasDe = (id) => casas.filter(c => String(c.territorio_id) === String(id)).length;

  // ── Panel ──
  const renderSesion = () => {
    const esForma = sesion.tipo.endsWith('forma');
    const titulo = {
      'territorio-nuevo': t('Dibuja el nuevo territorio'),
      'territorio-forma': t('Editar forma del territorio'),
      'manzana-nueva': t('Dibuja la manzana'),
      'manzana-forma': t('Editar forma de la manzana'),
    }[sesion.tipo];
    return (
      <>
        <div className="m3d-fila justify-between">
          <h2 className="m3d-h2 flex items-center gap-2"><Shapes size={16} style={{ color: '#16A34A' }} /> {titulo}</h2>
          <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={terminarSesion} aria-label={t('Cancelar')}><X size={16} /></button>
        </div>
        <p className="text-sm text-secondary m-0 m3d-pie">{t(INSTRUCCIONES[esForma ? 'forma' : (sesion.modo || 'polygon')])}</p>
        {sesion.tipo === 'territorio-nuevo' && (
          <div className="m3d-estados m3d-estados--libre">
            <button type="button" className={`m3d-estado${sesion.modo !== 'rectangle' ? ' is-sel' : ''}`} onClick={() => cambiarModo('polygon')}>
              <Pentagon size={14} /> {t('Polígono')}
            </button>
            <button type="button" className={`m3d-estado${sesion.modo === 'rectangle' ? ' is-sel' : ''}`} onClick={() => cambiarModo('rectangle')}>
              <Square size={14} /> {t('Rectángulo')}
            </button>
          </div>
        )}
        <div className="m3d-acciones">
          {esForma ? (
            <button type="button" className="btn btn-primary flex-1" onClick={() => guardarFormaEditada()} disabled={guardando}>
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {t('Guardar forma')}
            </button>
          ) : (
            <button type="button" className="m3d-accion" onClick={reiniciarDibujo}>
              <RotateCcw size={15} /> {t('Empezar de nuevo')}
            </button>
          )}
        </div>
      </>
    );
  };

  const renderManzanaNueva = () => (
    <>
      <div className="m3d-fila justify-between">
        <h2 className="m3d-h2">{t('Nueva manzana')}</h2>
        <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => setManzanaNueva(null)} aria-label={t('Cancelar')}><X size={16} /></button>
      </div>
      <p className="text-xs text-secondary m-0">{t('Polígono dibujado. Asigna un nombre a la manzana:')}</p>
      <input
        className="m3d-input"
        value={manzanaNueva.nombre}
        onChange={e => setManzanaNueva(m => ({ ...m, nombre: e.target.value }))}
        placeholder={t('Ej: 4A, 4B, Manzana Norte...')}
        onKeyDown={e => { if (e.key === 'Enter') guardarManzanaNueva(); }}
      />
      <div className="m3d-acciones">
        <button type="button" className="btn btn-primary flex-1" onClick={() => guardarManzanaNueva()} disabled={guardando || !manzanaNueva.nombre.trim()}>
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {t('Guardar')}
        </button>
      </div>
    </>
  );

  const renderLista = () => (
    <>
      <div className="m3d-fila justify-between">
        <h2 className="m3d-h2">{t('Territorios')}</h2>
        <button type="button" className="m3d-accion m3d-accion--azul" style={{ flex: '0 0 auto' }} onClick={() => iniciarSesion({ tipo: 'territorio-nuevo', modo: 'polygon' })} disabled={!listo}>
          <Plus size={15} /> {t('Nuevo territorio')}
        </button>
      </div>
      <div className="m3d-fila">
        <div className="m3d-buscador m3d-buscador--plano">
          <Search size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t('Buscar territorio...')} aria-label={t('Buscar territorio...')} />
        </div>
      </div>
      <div className={`m3d-lista${expandido ? ' is-open' : ''}`}>
        {loading && <p className="text-sm text-secondary flex items-center gap-2 m-0 py-2"><Loader2 size={14} className="animate-spin" /> {t('Cargando mapa...')}</p>}
        {!loading && lista.length === 0 && <p className="text-sm text-secondary m-0 py-2">{t('No hay territorios registrados.')}</p>}
        {lista.map(te => {
          const p = progreso[te.id];
          const cfg = PROGRESO[p?.estado] || PROGRESO.sin_trabajar;
          return (
            <button key={te.id} type="button" className="m3d-item" onClick={() => abrirTerritorio(te)}>
              <span className="m3d-item__color" style={{ background: te.color || '#3B82F6' }} />
              <span className="min-w-0 flex-1">
                <span className="m3d-item__titulo">{nombreTerritorio(te)}</span>
                {p && <span className="m3d-barra"><span style={{ width: `${p.pct}%`, background: cfg.color }} /></span>}
              </span>
              {p && <span className="m3d-item__pct">{p.pct}%</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="m3d-link self-start" onClick={() => setExpandido(v => !v)}>
        {expandido ? t('Ver menos') : t('Ver más')}
      </button>
    </>
  );

  const renderTerritorio = () => {
    const asignados = asignaciones.filter(a => String(a.territorio_id) === String(terrSel.id) && a.activa);
    const numCasas = numCasasDe(terrSel.id);
    return (
      <div className="m3d-scroll">
        <div className="m3d-fila justify-between">
          <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
            <span className="m3d-item__color" style={{ background: terrSel.color || '#3B82F6' }} />
            <span className="truncate">{nombreTerritorio(terrSel)}</span>
          </h2>
          <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => { setPanel('lista'); setSeleccionadoId(null); }} aria-label={t('Cerrar')}><X size={16} /></button>
        </div>
        {terrSel.descripcion && <p className="text-xs text-secondary m-0">{terrSel.descripcion}</p>}
        <p className="text-xs text-muted m-0">
          {t('{n} casas', { n: numCasas })}
          {terrSel.responsable ? ` · ${t('Responsable:')} ${terrSel.responsable}` : ''}
        </p>
        <p className="text-xs text-muted m-0 truncate">
          {asignados.length ? `${t('Asignados:')} ${asignados.map(nombreUsuario).join(', ')}` : t('Sin asignaciones')}
        </p>

        {/* Progreso + grupo (asignar / terminar) — panel oscuro como en la vista clásica */}
        <div className="rounded-xl p-2" style={{ background: '#0F172A' }}>
          <TerritorioTrabajo territorio={terrSel} progreso={progreso[terrSel.id]} />
        </div>

        <div className="m3d-acciones m3d-acciones--wrap">
          <button type="button" className="m3d-accion m3d-accion--azul" onClick={() => iniciarSesion({ tipo: 'territorio-forma', territorioId: terrSel.id }, terrSel.coordenadas)}>
            <Shapes size={15} /> {t('Editar forma')}
          </button>
          <button type="button" className="m3d-accion" onClick={() => setPanel('manzanas')}>
            <Grid2x2 size={15} /> {t('Manzanas')} ({manzanasTerr.length})
          </button>
          <button type="button" className="m3d-accion" onClick={() => abrirEdicion(terrSel)}>
            <Pencil size={15} /> {t('Editar datos')}
          </button>
          <button type="button" className="m3d-accion" onClick={() => setAsignacionesDe(terrSel)}>
            <Users size={15} /> {t('Asignaciones')}
          </button>
          <button type="button" className="m3d-accion" disabled={compartiendo} onClick={() => generarEnlace(terrSel)}>
            <Share2 size={15} /> {compartiendo ? t('Generando...') : t('Compartir')}
          </button>
          <button type="button" className="m3d-accion m3d-accion--roja" onClick={() => setBorrar({ id: terrSel.id, nombre: terrSel.nombre, count: numCasas })}>
            <Trash2 size={15} /> {t('Eliminar')}
          </button>
        </div>
      </div>
    );
  };

  const renderManzanas = () => (
    <>
      <div className="m3d-fila justify-between">
        <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
          <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => setPanel('territorio')} aria-label={t('Volver')}><ArrowLeft size={16} /></button>
          <span className="truncate">{t('Manzanas')} · {nombreTerritorio(terrSel)}</span>
        </h2>
      </div>
      <div className={`m3d-lista${expandido ? ' is-open' : ''}`}>
        {manzanasTerr.length === 0 && <p className="text-sm text-secondary m-0 py-1">{t('Sin manzanas. Dibuja la primera.')}</p>}
        {manzanasTerr.map(m => (
          <div key={m.id} className="m3d-item">
            <span className="m3d-item__color" style={{ background: m.color || terrSel.color || '#3B82F6' }} />
            <span className="m3d-item__titulo flex-1 min-w-0" style={{ marginBottom: 0 }}>{m.nombre}</span>
            <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={() => iniciarSesion({ tipo: 'manzana-forma', territorioId: terrSel.id, manzanaId: m.id }, m.coordenadas)} aria-label={t('Editar forma')} title={t('Editar forma')}>
              <Shapes size={15} />
            </button>
            <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" style={{ color: '#DC2626' }} onClick={() => setBorrarManzana(m)} aria-label={t('Eliminar')} title={t('Eliminar')}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="m3d-acciones">
        <button type="button" className="btn btn-primary flex-1" onClick={() => iniciarSesion({ tipo: 'manzana-nueva', modo: 'polygon', territorioId: terrSel.id })}>
          <Plus size={16} /> {t('Dibujar manzana')}
        </button>
      </div>
    </>
  );

  let contenido;
  if (sesion) contenido = renderSesion();
  else if (manzanaNueva) contenido = renderManzanaNueva();
  else if (panel === 'manzanas' && terrSel) contenido = renderManzanas();
  else if (panel === 'territorio' && terrSel) contenido = renderTerritorio();
  else contenido = renderLista();

  return (
    <div className="m3d">
      {/* ── Mapa ── */}
      <div className="m3d-mapa">
        <div ref={mapDivRef} className={`m3d-canvas${sesion ? ' is-drawing' : ''}`} />

        <div className="m3d-top">
          <div className="m3d-titulo">
            <span className="m3d-titulo__icono"><Shapes size={16} /></span>
            <div className="min-w-0">
              <p className="m3d-titulo__texto">{t('Gestión de Territorios')}</p>
              <p className="m3d-titulo__sub">{sesion ? t('Dibujando…') : t('Toca un territorio para gestionarlo')}</p>
            </div>
          </div>
          <div className="m3d-campana"><NotificationBell /></div>
        </div>

        {/* Mientras se dibuja no se cambia de estilo (borraría el dibujo) */}
        {!sesion && <BotonesMapa3D prefs={prefs} onCambiar={cambiarPrefs} onVistaClasica={onVistaClasica} />}

        {sinConexion && (
          <div className="m3d-aviso">
            <AlertTriangle size={14} />
            <span>{t('El mapa no cargó (sin conexión). Tus datos siguen disponibles.')}</span>
          </div>
        )}
      </div>

      {/* ── Panel inferior ── */}
      <div className={`m3d-sheet${expandido ? ' is-open' : ''}`}>
        <button type="button" className="m3d-sheet__asa" onClick={() => setExpandido(v => !v)} aria-label={expandido ? t('Ver menos') : t('Ver más')}>
          <span />
        </button>
        {contenido}
      </div>

      <TerritorioModales admin={admin} />

      {confirmarFuera && (
        <ConfirmModal
          message={t('La manzana se sale del territorio. ¿Guardar de todos modos?')}
          confirmText={t('Guardar')}
          cancelText={t('Cancelar')}
          onConfirm={() => { const accion = confirmarFuera; setConfirmarFuera(null); accion(); }}
          onCancel={() => setConfirmarFuera(null)}
        />
      )}
      {borrarManzana && (
        <ConfirmModal
          message={t('¿Eliminar la manzana "{nombre}"?', { nombre: borrarManzana.nombre })}
          detail={t('Esta acción no se puede deshacer.')}
          confirmText={t('Sí, eliminar')}
          danger
          onConfirm={eliminarManzana}
          onCancel={() => setBorrarManzana(null)}
        />
      )}
    </div>
  );
};

export default TerritoriosAdmin3D;
