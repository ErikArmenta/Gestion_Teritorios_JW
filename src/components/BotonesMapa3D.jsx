import React from 'react';
import { Box, Map as MapIcon, Satellite, ListChecks } from 'lucide-react';
import { t } from '../i18n';

// Botones flotantes de los mapas 3D (a la derecha, debajo de la barra superior):
// 2D/3D, satélite y "Vista clásica". `children` = botones extra de la pantalla (van al final).
const BotonesMapa3D = ({ prefs, onCambiar, onVistaClasica, children }) => (
  <div className="m3d-flotantes">
    <button
      type="button"
      className={`m3d-fab${prefs.tresD ? ' is-active' : ''}`}
      onClick={() => onCambiar({ tresD: !prefs.tresD })}
      title={prefs.tresD ? t('Ver en 2D') : t('Ver en 3D')}
      aria-label={prefs.tresD ? t('Ver en 2D') : t('Ver en 3D')}
    >
      {prefs.tresD ? <Box size={18} /> : <span className="m3d-fab__txt">3D</span>}
    </button>
    <button
      type="button"
      className={`m3d-fab${prefs.satelite ? ' is-active' : ''}`}
      onClick={() => onCambiar({ satelite: !prefs.satelite })}
      title={prefs.satelite ? t('Ver mapa') : t('Ver satélite')}
      aria-label={prefs.satelite ? t('Ver mapa') : t('Ver satélite')}
    >
      {prefs.satelite ? <MapIcon size={18} /> : <Satellite size={18} />}
    </button>
    {onVistaClasica && (
      <button
        type="button"
        className="m3d-fab"
        onClick={onVistaClasica}
        title={t('Vista clásica')}
        aria-label={t('Vista clásica')}
      >
        <ListChecks size={18} />
      </button>
    )}
    {children}
  </div>
);

export default BotonesMapa3D;
