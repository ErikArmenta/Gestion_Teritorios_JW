import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Navigation, Settings2, Pencil, Plus, ChevronUp, ChevronDown, Phone, MapPinned, Loader2,
  History,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import PanelMapa from '../components/PanelMapa';
import { useMapaPagina } from '../context/MapaFondoContext';
import EditHouseModal from '../components/EditHouseModal';
import useMapaPrincipal, { generarUrlGoogleMaps } from '../hooks/useMapaPrincipal';
import { STATUS_COLORS, STATUS_OPTIONS, getStatusColor } from '../utils/constants';
import { PROGRESO } from '../utils/territoryProgress';
import {
  poligonosGeoJSON, casasBloquesGeoJSON, casasPuntosGeoJSON, seleccionCasaGeoJSON, coordsCasa,
  rutaGeoJSON, rutaPuntosGeoJSON, limitesDe, VACIO, maplibregl, crearMarcadorExhibidor,
} from '../utils/map3d';
import { t, getLocale } from '../i18n';

// Mapa principal en 3D: usa el mapa de fondo compartido (context/MapaFondoContext.jsx); el panel va abajo
// en móvil y dentro del menú flotante en escritorio (components/PanelMapa.jsx).
// SOLO CONSULTA (regla del proyecto): casas, progreso, ruta de visitas y registrar visita de una casa.
// Editar/dibujar territorios, asignaciones, manzanas y compartir viven en /territorios.
// La lógica (filtros, progreso, búsqueda, ruta) es la misma que la vista clásica: hooks/useMapaPrincipal.js

const nombreTerritorio = (te) =>
  [te.numero && String(te.numero) !== String(te.nombre) ? te.numero : null, te.nombre].filter(Boolean).join(' · ');

const ordenNatural = (a, b) =>
  nombreTerritorio(a).localeCompare(nombreTerritorio(b), undefined, { numeric: true, sensitivity: 'base' });

// ── Piezas del panel ──────────────────────────────────────────────────────────────────

const BarraProgreso = ({ progreso, compacta = false }) => {
  if (!progreso) return null;
  const cfg = PROGRESO[progreso.estado] || PROGRESO.sin_trabajar;
  return (
    <div className={compacta ? '' : 'm3d-progreso'}>
      {!compacta && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="m3d-pill" style={{ background: `${cfg.color}22`, color: cfg.color }}>{t(cfg.label)}</span>
          <span className="text-sm font-extrabold text-primary">{progreso.pct}%</span>
        </div>
      )}
      <div className="m3d-barra"><span style={{ width: `${progreso.pct}%`, background: cfg.color }} /></div>
      {!compacta && (
        <p className="text-xs mt-1.5 flex items-center gap-1.5 text-secondary">
          {progreso.grupo && <span className="legend-dot shrink-0" style={{ width: 8, height: 8, borderRadius: 9999, background: progreso.grupo.color }} />}
          <span>{t('{v}/{t} casas', { v: progreso.visitadas, t: progreso.total })}{progreso.detalle ? ` · ${progreso.detalle}` : ''}</span>
        </p>
      )}
    </div>
  );
};

const HistorialCasa = ({ casaId }) => {
  const { fetchHistorialCasa } = useData();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState(null); // null = sin cargar
  const [cargando, setCargando] = useState(false);

  const alternar = async () => {
    if (items === null && !cargando) {
      setCargando(true);
      try { setItems(((await fetchHistorialCasa(casaId)) || []).slice(0, 5)); }
      catch { setItems([]); }
      finally { setCargando(false); }
    }
    setAbierto(v => !v);
  };

  const fecha = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div>
      <button type="button" className="m3d-link" onClick={alternar}>
        <History size={14} />
        {cargando ? t('Cargando historial...') : abierto ? t('Ocultar historial') : t('Ver historial')}
      </button>
      {abierto && !cargando && (
        <div className="flex flex-col gap-1.5 mt-2">
          {!items?.length && <p className="text-xs text-muted m-0">{t('Sin historial de visitas')}</p>}
          {items?.map(h => (
            <div key={h.id} className="flex gap-2 items-start text-xs">
              <span className="legend-dot shrink-0 mt-1" style={{ width: 7, height: 7, borderRadius: 9999, background: getStatusColor(h.estado_nuevo) }} />
              <span className="text-secondary">
                {fecha(h.created_at)} — <strong className="text-primary">{h.usuario_nombre || t('Usuario')}</strong>
                {': '}{t(h.estado_anterior || '')} → <strong style={{ color: getStatusColor(h.estado_nuevo) }}>{t(h.estado_nuevo)}</strong>
                {h.notas && <em className="block text-muted">{h.notas}</em>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Pantalla ──────────────────────────────────────────────────────────────────────────

const TerritoriesMap3D = () => {
  const {
    casas, manzanas, loading, esAdmin, miGrupo,
    filtroMisTerr, setFiltroMisTerr, modoProgreso, setModoProgreso,
    territoriosFiltrados, casasFiltradas, progresoPorTerritorio,
    busqueda, setBusqueda, busquedaDebounced, resultadosBusqueda,
    rutaActiva, setRutaActiva, iniciarRuta, asignadosDe,
  } = useMapaPrincipal();
  const { registrarVisita, exhibidores, exhibidorTurnos } = useData();
  const toast = useToast();
  const navigate = useNavigate();

  const ultimoFitRef = useRef(null);

  const [panel, setPanel] = useState({ tipo: 'resumen' }); // resumen | territorio {id} | casa {id}
  const [expandido, setExpandido] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [editCasa, setEditCasa] = useState(null);
  const [visitando, setVisitando] = useState(null);
  const [buscando, setBuscando] = useState(false); // buscador con foco

  const territoriosOrdenados = useMemo(() => [...territoriosFiltrados].sort(ordenNatural), [territoriosFiltrados]);

  const casaSel = panel.tipo === 'casa' ? casas.find(c => String(c.id) === panel.id) : null;
  const exhSel = panel.tipo === 'exhibidor' ? exhibidores.find(e => String(e.id) === panel.id) : null;
  const exhibidoresActivos = useMemo(() => exhibidores.filter(e => e.activo !== false), [exhibidores]);
  const terrSel = panel.tipo === 'territorio' ? territoriosFiltrados.find(te => String(te.id) === panel.id) : null;
  // La ruta se muestra mientras exista, salvo que se esté viendo una casa
  const vista = casaSel ? 'casa' : exhSel ? 'exhibidor' : rutaActiva ? 'ruta' : terrSel ? 'territorio' : 'resumen';

  // ── Datos del mapa (GeoJSON memorizado: solo se manda al mapa lo que cambió) ──
  const territoriosGJ = useMemo(() => poligonosGeoJSON(territoriosFiltrados, '#2563EB', (te) => {
    const p = progresoPorTerritorio[te.id];
    const etiqueta = nombreTerritorio(te) + (p ? `\n${p.pct}%` : '');
    if (!modoProgreso) return { etiqueta, relleno: 0.16 };
    return {
      etiqueta,
      color: PROGRESO[p?.estado]?.color || '#94A3B8',
      relleno: 0.12 + ((p?.pct || 0) / 100) * 0.4,
    };
  }), [territoriosFiltrados, progresoPorTerritorio, modoProgreso]);

  const manzanasGJ = useMemo(() => {
    const colorDe = {};
    territoriosFiltrados.forEach(te => { colorDe[String(te.id)] = te.color; });
    const visibles = manzanas.filter(m => colorDe[String(m.territorio_id)] !== undefined);
    return poligonosGeoJSON(visibles, '#2563EB', (m) => ({ color: m.color || colorDe[String(m.territorio_id)] || '#2563EB' }));
  }, [manzanas, territoriosFiltrados]);

  const casasBloques = useMemo(() => casasBloquesGeoJSON(casasFiltradas), [casasFiltradas]);
  const casasPuntos = useMemo(() => casasPuntosGeoJSON(casasFiltradas), [casasFiltradas]);

  const coordSel = casaSel ? coordsCasa(casaSel) : null;
  const seleccion = useMemo(
    () => (coordSel ? seleccionCasaGeoJSON(coordSel[0], coordSel[1]) : VACIO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordSel?.[0], coordSel?.[1]]
  );

  const ruta = useMemo(() => rutaGeoJSON(rutaActiva?.casasOrdenadas), [rutaActiva]);
  const rutaPuntos = useMemo(() => rutaPuntosGeoJSON(rutaActiva?.casasOrdenadas), [rutaActiva]);

  const datos = useMemo(() => ({
    territorios: territoriosGJ, manzanas: manzanasGJ, 'casas-bloques': casasBloques, 'casas-puntos': casasPuntos,
    seleccion, ruta, 'ruta-puntos': rutaPuntos,
  }), [territoriosGJ, manzanasGJ, casasBloques, casasPuntos, seleccion, ruta, rutaPuntos]);

  // ── Toques en el mapa ──
  // (mapa compartido: devuelve cómo quitar el evento al salir de la pantalla)
  const alCrear = (map) => {
    const alTocar = (e) => {
      const caja = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
      const capasCasa = ['casas-3d', 'casas-punto'].filter(id => map.getLayer(id));
      const casa = capasCasa.length ? map.queryRenderedFeatures(caja, { layers: capasCasa })[0] : null;
      if (casa) {
        setPanel({ tipo: 'casa', id: casa.properties.id });
        return;
      }
      const terr = map.getLayer('territorios-relleno')
        ? map.queryRenderedFeatures(e.point, { layers: ['territorios-relleno'] })[0]
        : null;
      setPanel(terr ? { tipo: 'territorio', id: terr.properties.id } : { tipo: 'resumen' });
    };
    map.on('click', alTocar);
    return () => map.off('click', alTocar);
  };

  const { mapRef, listo } = useMapaPagina({ datos, alCrear });

  // Encuadrar los territorios visibles: al abrir, al cambiar el conjunto o al tocar un filtro
  // (no en cada render: antes saltaba el mapa sin parar)
  const claveFit = useMemo(() => `${territoriosFiltrados.map(te => te.id).join(',')}|${fitKey}`, [territoriosFiltrados, fitKey]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || ultimoFitRef.current === claveFit) return;
    const limites = limitesDe(territoriosGJ);
    if (!limites) return;
    const primera = ultimoFitRef.current === null;
    ultimoFitRef.current = claveFit;
    map.fitBounds(limites, { padding: 40, maxZoom: 17, duration: primera ? 0 : 800 });
  }, [listo, claveFit, territoriosGJ, mapRef]);

  // Exhibidores en el mapa (marcadores DOM con el anaquel); el seleccionado se resalta
  const exhSelId = exhSel ? String(exhSel.id) : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return undefined;
    const marcadores = exhibidoresActivos.flatMap(exh => {
      const lat = Number(exh.latitud); const lng = Number(exh.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const el = crearMarcadorExhibidor(exh, String(exh.id) === exhSelId, () => {
        setPanel({ tipo: 'exhibidor', id: String(exh.id) });
        map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16.5), duration: 700 });
      });
      return [new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)];
    });
    return () => marcadores.forEach(m => m.remove());
  }, [listo, exhibidoresActivos, exhSelId, mapRef]);

  // Ruta nueva → encuadrarla
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rutaActiva) return;
    const limites = limitesDe(rutaPuntosGeoJSON(rutaActiva.casasOrdenadas));
    if (limites) map.fitBounds(limites, { padding: 50, maxZoom: 18, duration: 800 });
  }, [rutaActiva, mapRef]);

  const volarACasa = (c) => {
    const p = coordsCasa(c);
    if (p) mapRef.current?.easeTo({ center: p, zoom: Math.max(mapRef.current.getZoom(), 18), duration: 700 });
  };

  const abrirTerritorio = (te) => {
    setPanel({ tipo: 'territorio', id: String(te.id) });
    setExpandido(false);
    const f = territoriosGJ.features.find(x => x.properties.id === String(te.id));
    const limites = f && limitesDe(f);
    if (limites) mapRef.current?.fitBounds(limites, { padding: 40, maxZoom: 18, duration: 800 });
  };

  const abrirCasa = (c) => {
    setPanel({ tipo: 'casa', id: String(c.id) });
    volarACasa(c);
  };

  const cerrarPanel = () => setPanel({ tipo: 'resumen' });
  const cancelarRuta = () => { setRutaActiva(null); setPanel({ tipo: 'resumen' }); };

  const elegirFiltro = (mis) => { setFiltroMisTerr(mis); setFitKey(k => k + 1); setPanel({ tipo: 'resumen' }); };

  const visitar = async (estado) => {
    if (!casaSel || visitando) return;
    if (Number(casaSel.id) < 0) {
      toast.warning(t('Esta casa aún no se sincroniza; cambia su estado cuando vuelva la conexión.'));
      return;
    }
    setVisitando(estado);
    try {
      await registrarVisita({ casa: casaSel, estadoNuevo: estado });
      toast.success(navigator.onLine ? t('Visita registrada correctamente') : t('Visita guardada sin conexión — se sincronizará al conectarse'));
      try { navigator.vibrate?.(30); } catch { /* sin vibración */ }
    } catch (err) {
      toast.error(`${t('Error al registrar la visita')}${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setVisitando(null);
    }
  };

  const mostrarResultados = buscando && !!busquedaDebounced;

  return (
    <>
      <PanelMapa
        abierto={expandido}
        titulo={casaSel ? casaSel.direccion : exhSel ? exhSel.nombre : vista === 'ruta' ? t('Ruta de Visitas') : terrSel ? [terrSel.numero, terrSel.nombre].filter(Boolean).join(' · ') : (filtroMisTerr ? t('Mis territorios') : t('Territorios'))}
        resumen={vista === 'resumen' ? `${t('{n} territorios', { n: territoriosFiltrados.length })} · ${t('{n} casas', { n: casasFiltradas.length })}` : null}
        abrirCon={vista === 'resumen' ? null : `${vista}:${panel.id ?? ''}`}
        cabecera={(
          <div className="m3d-cabecera__busqueda">
            <div className="m3d-buscador">
              <Search size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onFocus={() => setBuscando(true)}
                onBlur={() => setTimeout(() => setBuscando(false), 200)}
                placeholder={t('Buscar dirección, contacto...')}
                enterKeyHint="search"
                aria-label={t('Buscar dirección, contacto...')}
              />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} aria-label={t('Limpiar')} className="m3d-buscador__x">
                  <X size={14} />
                </button>
              )}
            </div>
            {mostrarResultados && (
              <div className="m3d-resultados">
                {resultadosBusqueda.length === 0 ? (
                  <p className="m3d-resultados__vacio">{t('Sin resultados para "{q}"', { q: busquedaDebounced })}</p>
                ) : resultadosBusqueda.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="m3d-resultado"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setBusqueda(''); setBuscando(false); abrirCasa(c); }}
                  >
                    <span className="m3d-resultado__dir">{c.direccion}</span>
                    <span className="m3d-resultado__meta">
                      <span className="truncate">{c.territorio_nombre}</span>
                      <span className="m3d-pill" style={{ background: `${getStatusColor(c.estado)}22`, color: getStatusColor(c.estado) }}>{t(c.estado)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      >
        {/* ── Resumen: filtros + lista de territorios ── */}
        {vista === 'resumen' && (
          <>
            <div className="m3d-fila justify-between">
              <h2 className="m3d-h2">{filtroMisTerr ? t('Mis territorios') : t('Territorios')}</h2>
              <span className="text-xs font-semibold text-muted shrink-0">
                {t('{n} territorios', { n: territoriosFiltrados.length })} · {t('{n} casas', { n: casasFiltradas.length })}
              </span>
            </div>
            <div className="m3d-estados m3d-estados--libre">
              <button type="button" className={`m3d-estado${!filtroMisTerr ? ' is-sel' : ''}`} onClick={() => elegirFiltro(false)}>{t('Ver todos')}</button>
              <button type="button" className={`m3d-estado${filtroMisTerr ? ' is-sel' : ''}`} onClick={() => elegirFiltro(true)}>{t('Mis territorios')}</button>
              <button
                type="button"
                className={`m3d-estado${modoProgreso ? ' is-sel is-verde' : ''}`}
                onClick={() => setModoProgreso(v => !v)}
                title={t('Colorear territorios según su progreso')}
              >
                {t('Progreso')}
              </button>
            </div>
            {modoProgreso && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.values(PROGRESO).map(p => (
                  <span key={p.label} className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className="legend-dot" style={{ width: 8, height: 8, borderRadius: 9999, background: p.color }} />{t(p.label)}
                  </span>
                ))}
              </div>
            )}

            <div className={`m3d-lista${expandido ? ' is-open' : ''}`}>
              {loading && (
                <p className="text-sm text-secondary flex items-center gap-2 m-0 py-2"><Loader2 size={14} className="animate-spin" /> {t('Cargando mapa...')}</p>
              )}
              {!loading && territoriosOrdenados.length === 0 && (
                <div className="py-2">
                  <p className="text-sm font-bold text-primary m-0">{filtroMisTerr ? t('No tienes territorios asignados') : t('No hay territorios')}</p>
                  {filtroMisTerr && (
                    <p className="text-xs text-secondary mt-1 mb-0">
                      {miGrupo
                        ? t('Tu grupo ({grupo}) no está trabajando ningún territorio ahora.', { grupo: miGrupo.nombre })
                        : t('Pide que te asignen un territorio o que te agreguen a un grupo.')}
                    </p>
                  )}
                </div>
              )}
              {territoriosOrdenados.map(te => {
                const p = progresoPorTerritorio[te.id];
                return (
                  <button key={te.id} type="button" className="m3d-item" onClick={() => abrirTerritorio(te)}>
                    <span className="m3d-item__color" style={{ background: te.color || '#2563EB' }} />
                    <span className="min-w-0 flex-1">
                      <span className="m3d-item__titulo">{nombreTerritorio(te)}</span>
                      <BarraProgreso progreso={p} compacta />
                    </span>
                    {p && <span className="m3d-item__pct">{p.pct}%</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Territorio ── */}
        {vista === 'territorio' && terrSel && (() => {
          const p = progresoPorTerritorio[terrSel.id];
          const asignados = asignadosDe(terrSel.id);
          const pendientes = casas.filter(c => String(c.territorio_id) === String(terrSel.id) && c.estado === 'Pendiente').length;
          return (
            <div className="m3d-scroll">
              <div className="m3d-fila justify-between">
                <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
                  <span className="m3d-item__color" style={{ background: terrSel.color || '#2563EB' }} />
                  <span className="truncate">{nombreTerritorio(terrSel)}</span>
                </h2>
                <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={cerrarPanel} aria-label={t('Cerrar')}><X size={16} /></button>
              </div>
              <BarraProgreso progreso={p} />
              {asignados.length > 0 && (
                <p className="text-xs text-secondary m-0"><strong className="text-primary">{t('Asignados:')}</strong> {asignados.join(', ')}</p>
              )}
              <p className="text-xs text-secondary m-0">{t('{n} casas pendientes', { n: pendientes })}</p>
              <div className="m3d-acciones m3d-acciones--wrap">
                {pendientes > 0 && (
                  <button type="button" className="m3d-accion m3d-accion--verde" onClick={() => iniciarRuta(terrSel.id)}>
                    <Navigation size={15} /> {t('Ruta de Visitas')}
                  </button>
                )}
                <button type="button" className="m3d-accion m3d-accion--azul" onClick={() => navigate(`/register?territorio=${terrSel.id}`)}>
                  <Plus size={15} /> {t('Registrar casa')}
                </button>
                {esAdmin && (
                  <button type="button" className="m3d-accion" onClick={() => navigate(`/territorios?id=${terrSel.id}`)}>
                    <Settings2 size={15} /> {t('Gestionar')}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Exhibidor (consulta; se gestiona en Exhibidores) ── */}
        {vista === 'exhibidor' && exhSel && (() => {
          const hoy = new Date().toISOString().slice(0, 10);
          const proximos = exhibidorTurnos.filter(tu => String(tu.exhibidor_id) === String(exhSel.id) && tu.fecha >= hoy).length;
          const lat = Number(exhSel.latitud); const lng = Number(exhSel.longitud);
          return (
            <div className="m3d-scroll">
              <div className="m3d-fila justify-between">
                <h2 className="m3d-h2 flex items-center gap-2 min-w-0">
                  <span className="m3d-item__color" style={{ background: exhSel.color || '#F59E0B', borderRadius: 9999 }} />
                  <span className="truncate">{exhSel.nombre}</span>
                </h2>
                <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={cerrarPanel} aria-label={t('Cerrar')}><X size={16} /></button>
              </div>
              <span className="m3d-pill self-start" style={{ background: 'rgba(245,158,11,0.16)', color: '#B45309' }}>{t('Exhibidor')}</span>
              {exhSel.direccion && <p className="text-sm text-secondary m-0">{exhSel.direccion}</p>}
              {exhSel.descripcion && <p className="text-xs text-muted m-0">{exhSel.descripcion}</p>}
              <p className="text-xs text-secondary m-0">{t('{n} turnos próximos', { n: proximos })}</p>
              <div className="m3d-acciones m3d-acciones--wrap">
                <button type="button" className="m3d-accion m3d-accion--azul" onClick={() => navigate(`/exhibidores?id=${exhSel.id}`)}>
                  <Navigation size={15} /> {t('Ver turnos')}
                </button>
                {Number.isFinite(lat) && Number.isFinite(lng) && (
                  <a
                    className="m3d-accion"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPinned size={15} /> {t('Cómo llegar')}
                  </a>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Casa ── */}
        {vista === 'casa' && casaSel && (() => {
          const color = STATUS_COLORS[casaSel.estado]?.hex || '#6B7280';
          const manz = casaSel.manzana_id ? manzanas.find(m => String(m.id) === String(casaSel.manzana_id)) : null;
          const coords = coordsCasa(casaSel);
          return (
            <div className="m3d-scroll">
              <div className="m3d-fila justify-between">
                <span className="m3d-pill m3d-pill--lg" style={{ background: color, color: '#fff' }}>{t(casaSel.estado)}</span>
                {/* Al cerrar, si hay ruta activa se vuelve a ella (ver `vista`) */}
                <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={cerrarPanel} aria-label={t('Cerrar')}>
                  <X size={16} />
                </button>
              </div>

              <h2 className="m3d-h2 m3d-h2--dir">{casaSel.direccion}</h2>
              <p className="text-xs text-secondary m-0">
                {casaSel.territorio_nombre}{manz ? ` · ${manz.nombre}` : ''}
              </p>

              {casaSel.foto_url && (
                <img src={casaSel.foto_url} alt={t('Foto')} className="m3d-foto" />
              )}

              <div className="m3d-datos">
                {casaSel.nombre_contacto && <p><strong>{t('Contacto:')}</strong> {casaSel.nombre_contacto}</p>}
                {casaSel.notas && <p><strong>{t('Notas:')}</strong> {casaSel.notas}</p>}
              </div>
              {casaSel.audio_url && (
                <audio controls src={casaSel.audio_url} className="w-full" style={{ height: 36 }} onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              {casaSel.tiene_caso_especial && (
                <div className="m3d-alerta m3d-alerta--roja">
                  <strong>{t('Caso especial')}{casaSel.tipo_caso ? ` (${t(casaSel.tipo_caso)})` : ''}:</strong> {casaSel.detalles_caso}
                </div>
              )}
              {casaSel._offline && (
                <div className="m3d-alerta m3d-alerta--ambar">⏳ {t('Pendiente de sincronizar')}</div>
              )}

              {/* Registrar visita con un toque */}
              <p className="m3d-etiqueta">{t('Registrar visita')}</p>
              <div className="m3d-estados">
                {STATUS_OPTIONS.map(s => {
                  const activo = casaSel.estado === s;
                  const c = getStatusColor(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`m3d-estado${activo ? ' is-active' : ''}`}
                      style={activo ? { background: c, borderColor: c, color: '#fff' } : undefined}
                      onClick={() => visitar(s)}
                      disabled={!!visitando}
                    >
                      {visitando === s
                        ? <Loader2 size={12} className="animate-spin" />
                        : !activo && <span className="legend-dot" style={{ width: 8, height: 8, borderRadius: 9999, background: c }} />}
                      {t(s)}
                    </button>
                  );
                })}
              </div>

              <HistorialCasa key={casaSel.id} casaId={casaSel.id} />

              <div className="m3d-acciones m3d-acciones--wrap">
                <button type="button" className="m3d-accion m3d-accion--azul" onClick={() => setEditCasa(casaSel)}>
                  <Pencil size={15} /> {t('Editar')}
                </button>
                {casaSel.telefono && (
                  <a className="m3d-accion" href={`tel:${casaSel.telefono}`}><Phone size={15} /> {t('Llamar')}</a>
                )}
                {coords && (
                  <a
                    className="m3d-accion"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1].toFixed(6)},${coords[0].toFixed(6)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPinned size={15} /> {t('Cómo llegar')}
                  </a>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Ruta de visitas ── */}
        {vista === 'ruta' && rutaActiva && (
          <>
            <div className="m3d-fila justify-between">
              <h2 className="m3d-h2 flex items-center gap-2"><Navigation size={16} style={{ color: '#2563EB' }} /> {t('Ruta de Visitas')}</h2>
              <button type="button" className="m3d-btn-icono m3d-btn-icono--sm" onClick={cancelarRuta} aria-label={t('Cancelar ruta')}><X size={16} /></button>
            </div>
            <p className="text-xs text-muted m-0">{t('{n} casas pendientes', { n: rutaActiva.casasOrdenadas.length })}</p>
            <div className={`m3d-lista${expandido ? ' is-open' : ''}`}>
              {rutaActiva.casasOrdenadas.map((c, i) => (
                <button key={c.id} type="button" className="m3d-item" onClick={() => abrirCasa(c)}>
                  <span className="m3d-item__num">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="m3d-item__titulo">{c.direccion}</span>
                    {c.nombre_contacto && <span className="m3d-item__sub">{c.nombre_contacto}</span>}
                  </span>
                </button>
              ))}
            </div>
            <div className="m3d-acciones">
              <a
                className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                href={generarUrlGoogleMaps(rutaActiva.casasOrdenadas)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation size={15} /> {t('Abrir en Google Maps')}
              </a>
            </div>
          </>
        )}

        {/* Mostrar más / menos (lista de territorios o de la ruta) */}
        {(vista === 'resumen' || vista === 'ruta') && (
          <button type="button" className="m3d-link self-start" onClick={() => setExpandido(v => !v)}>
            {expandido ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {expandido ? t('Ver menos') : t('Ver más')}
          </button>
        )}
      </PanelMapa>

      {editCasa && (
        <EditHouseModal casa={editCasa} onClose={() => setEditCasa(null)} onSaved={() => setEditCasa(null)} />
      )}
    </>
  );
};

export default TerritoriesMap3D;
