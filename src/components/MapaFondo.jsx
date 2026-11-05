import React, { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useMapaFondo } from '../context/MapaFondoContext';
import useMapa3D from '../hooks/useMapa3D';
import NotificationBell from './NotificationBell';
import BotonesMapa3D from './BotonesMapa3D';
import { FUENTES, VACIO } from '../utils/map3d';
import { t } from '../i18n';

// El mapa 3D de fondo, compartido por las pantallas con mapa (ver context/MapaFondoContext.jsx).
// Se monta la primera vez que se entra a una de ellas y ya no se desmonta: al ir a otra pantalla solo
// se oculta, así al volver aparece al instante. También pone la campana, los botones 3D/satélite y el
// aviso de sin conexión (una sola vez para todas las pantallas).
const VACIOS = Object.fromEntries(FUENTES.map(id => [id, VACIO]));

const MapaFondo = ({ visible }) => {
  const { prefs, cambiarPrefs, datosPagina, marcarFallo, setInstancia, registrarMapa, altoPanel, bloquearEstilo } = useMapaFondo();
  const { theme } = useTheme();
  const divRef = useRef(null);
  const geoActivoRef = useRef(false);
  const ubicarRef = useRef(null);

  // Lo que la pantalla no mande queda vacío (p. ej. la ruta al salir del mapa principal)
  const datos = useMemo(() => ({ ...VACIOS, ...(datosPagina || {}) }), [datosPagina]);

  const alCrear = (map, geo) => {
    geo.on('trackuserlocationstart', () => { geoActivoRef.current = true; });
    geo.on('trackuserlocationend', () => { geoActivoRef.current = false; });
    geo.on('error', () => { geoActivoRef.current = false; });
    // "Ubicarme" sin apagar el seguimiento si ya estaba activo (trigger() lo alterna)
    ubicarRef.current = () => { if (!geoActivoRef.current) geo.trigger(); };
  };

  const { mapRef, geoRef, listo, sinConexion } = useMapa3D(divRef, {
    prefs, oscuro: theme === 'dark', datos, alCrear, onFallo: marcarFallo,
  });

  // Compartir la instancia con las pantallas
  useEffect(() => {
    registrarMapa(mapRef.current, geoRef.current, () => ubicarRef.current?.());
    setInstancia({ listo, sinConexion });
  }, [listo, sinConexion, mapRef, geoRef, registrarMapa, setInstancia]);

  // Al volver a mostrarse, el contenedor pudo cambiar de tamaño
  useEffect(() => { if (visible) mapRef.current?.resize(); }, [visible, mapRef]);

  return (
    <div
      className={`m3d-fondo${visible ? '' : ' is-oculto'}`}
      style={{ '--alto-panel': `${Math.max(0, altoPanel - 16)}px` }}
      aria-hidden={!visible}
    >
      <div ref={divRef} className="m3d-canvas" />
      <div className="m3d-fondo__derecha">
        <div className="m3d-campana"><NotificationBell /></div>
        {/* Mientras se dibuja no se cambia de estilo (borraría el dibujo) */}
        {!bloquearEstilo && <BotonesMapa3D prefs={prefs} onCambiar={cambiarPrefs} />}
      </div>
      {sinConexion && (
        <div className="m3d-aviso">
          <AlertTriangle size={14} />
          <span>{t('El mapa no cargó (sin conexión). Tus datos siguen disponibles.')}</span>
        </div>
      )}
    </div>
  );
};

export default MapaFondo;
