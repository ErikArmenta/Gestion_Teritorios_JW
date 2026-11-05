import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMapaFondo } from '../context/MapaFondoContext';
import useEsMovil from '../hooks/useEsMovil';

// Panel de una pantalla con mapa 3D.
//  - Móvil: `cabecera` arriba sobre el mapa y `children` en el panel inferior; el alto del panel se
//    reporta para que el mapa de fondo termine justo encima (el pin del centro queda a la vista).
//  - Escritorio: cabecera + contenido van DENTRO del menú flotante (components/MenuFlotante.jsx).
const PanelMapa = ({ cabecera, children, abierto = false, claseCabecera = '' }) => {
  const esMovil = useEsMovil();
  const { slotPanel, setAltoPanel } = useMapaFondo();
  const panelRef = useRef(null);

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
      <div ref={panelRef} className={`m3d-sheet${abierto ? ' is-open' : ''}`}>{children}</div>
    </div>
  );
};

export default PanelMapa;
