import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
import { useMapaFondo } from '../context/MapaFondoContext';
import useEsMovil from '../hooks/useEsMovil';
import { t } from '../i18n';

// Panel de una pantalla con mapa 3D.
//  - Móvil: `cabecera` arriba sobre el mapa y `children` en el panel inferior; el alto del panel se
//    reporta para que el mapa de fondo termine justo encima (el pin del centro queda a la vista).
//    El panel se puede COLAPSAR (solo queda una barrita con `titulo` y `resumen`): la rayita de arriba o
//    deslizar abajo lo colapsa; tocar la barrita o deslizar arriba lo abre. Empieza colapsado y se recuerda
//    por pantalla (localStorage `panel_mapa:<ruta>`). Cuando cambia `abrirCon` (tocar una casa, un territorio…)
//    se abre solo, para que no quede escondida la ficha.
//  - Escritorio: cabecera + contenido van DENTRO del menú flotante (components/MenuFlotante.jsx).
const leerColapsado = (clave) => {
  try { return localStorage.getItem(clave) !== '0'; } catch { return true; }
};

const PanelMapa = ({ cabecera, children, abierto = false, claseCabecera = '', titulo, resumen, abrirCon = null }) => {
  const esMovil = useEsMovil();
  const { slotPanel, setAltoPanel } = useMapaFondo();
  const panelRef = useRef(null);
  const toque = useRef(null);
  const { pathname } = useLocation();
  const clave = `panel_mapa:${pathname}`;
  // Si la pantalla abre ya con algo elegido (p. ej. /territorios?id=X), arranca abierto
  const [colapsado, setColapsado] = useState(() => (abrirCon != null ? false : leerColapsado(clave)));
  // Abrir solo cuando la pantalla muestra algo nuevo en el panel (derivado de props, sin efecto)
  const [abrirPrevio, setAbrirPrevio] = useState(abrirCon);
  if (abrirCon !== abrirPrevio) {
    setAbrirPrevio(abrirCon);
    if (abrirCon != null && colapsado) setColapsado(false);
  }

  const cambiar = (valor) => {
    setColapsado(valor);
    try { localStorage.setItem(clave, valor ? '1' : '0'); } catch { /* sin storage */ }
  };

  // Deslizar sobre la parte de arriba del panel: abajo = colapsar, arriba = abrir
  const alTocar = (e) => {
    const el = panelRef.current;
    const y = e.touches?.[0]?.clientY;
    if (!el || y == null) return;
    toque.current = y - el.getBoundingClientRect().top < 48 ? y : null;
  };
  const alSoltar = (e) => {
    const inicio = toque.current;
    toque.current = null;
    const y = e.changedTouches?.[0]?.clientY;
    if (inicio == null || y == null) return;
    if (y - inicio > 40 && !colapsado) cambiar(true);
    else if (inicio - y > 30 && colapsado) cambiar(false);
  };

  // Móvil: medir el panel inferior
  useEffect(() => {
    if (!esMovil) { setAltoPanel(0); return undefined; }
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAltoPanel(el.offsetHeight));
    ro.observe(el);
    setAltoPanel(el.offsetHeight);
    return () => { ro.disconnect(); setAltoPanel(0); };
  }, [esMovil, setAltoPanel]);

  if (!esMovil) {
    if (!slotPanel) return null; // el menú flotante aún no se monta (un instante)
    return createPortal(
      <>
        {cabecera && <div className={`m3d-cabecera ${claseCabecera}`}>{cabecera}</div>}
        <div className="m3d-menu__contenido">{children}</div>
      </>,
      slotPanel
    );
  }

  return (
    <div className="m3d">
      {cabecera && <div className="m3d-top"><div className={`m3d-cabecera ${claseCabecera}`}>{cabecera}</div></div>}
      <div
        ref={panelRef}
        className={`m3d-sheet${abierto && !colapsado ? ' is-open' : ''}${colapsado ? ' is-colapsado' : ''}`}
        onTouchStart={alTocar}
        onTouchEnd={alSoltar}
        data-panel-mapa={colapsado ? 'colapsado' : 'abierto'}
      >
        <button
          type="button"
          className="m3d-sheet__asa"
          onClick={() => cambiar(!colapsado)}
          aria-expanded={!colapsado}
          aria-label={colapsado ? t('Mostrar panel') : t('Ocultar panel')}
          title={colapsado ? t('Mostrar panel') : t('Ocultar panel')}
        >
          <span />
        </button>
        {colapsado && (
          <button type="button" className="m3d-sheet__barra" onClick={() => cambiar(false)} aria-label={t('Mostrar panel')}>
            <span className="m3d-sheet__barra-titulo">{titulo || t('Mostrar panel')}</span>
            {resumen && <span className="m3d-sheet__barra-resumen">{resumen}</span>}
            <ChevronUp size={18} className="m3d-sheet__barra-flecha" />
          </button>
        )}
        {/* El contenido sigue montado (no pierde lo que se escribió); colapsado solo se oculta */}
        <div className="m3d-sheet__cuerpo" style={{ display: colapsado ? 'none' : 'contents' }}>{children}</div>
      </div>
    </div>
  );
};

export default PanelMapa;
