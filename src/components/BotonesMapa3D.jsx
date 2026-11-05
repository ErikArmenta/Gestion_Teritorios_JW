import React from 'react';
import { Box, Map as MapIcon, Satellite, ListChecks, Sparkles } from 'lucide-react';
import { t } from '../i18n';

// Botones flotantes de los mapas 3D (a la derecha, debajo de la barra superior):
// 2D/3D, satélite, neón (solo en modo claro: en oscuro el mapa ya es neón) y "Vista clásica".
// `children` = botones extra de la pantalla (van al final).
const BotonesMapa3D = ({ prefs, onCambiar, onVistaClasica, oscuro = false, children }) => (
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
    {!oscuro && !prefs.satelite && (
      <button
        type="button"
        className={`m3d-fab${prefs.neon ? ' is-active' : ''}`}
        onClick={() => onCambiar({ neon: !prefs.neon })}
        title={prefs.neon ? t('Mapa claro') : t('Mapa neón')}
        aria-label={prefs.neon ? t('Mapa claro') : t('Mapa neón')}
      >
        <Sparkles size={18} />
      </button>
    )}
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
