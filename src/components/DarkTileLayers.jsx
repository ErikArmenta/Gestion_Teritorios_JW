import { TileLayer } from 'react-leaflet';
import { DARK_MAP_TILES } from '../utils/constants';

// Mapa oscuro con nombres de calles en blanco neón.
// Las 3 capas usan el mismo tile (el navegador lo descarga una sola vez):
//  1. dark-tiles       → mapa invertido, conserva manzanas/parques/relieve
//  2. dark-tiles-text  → solo lo más claro (letras) en blanco puro, mezclado con "lighten"
//  3. dark-tiles-glow  → lo mismo difuminado con "screen" = brillo neón
// Estilos en index.css.
const DarkTileLayers = () => (
  <>
    <TileLayer {...DARK_MAP_TILES} />
    <TileLayer url={DARK_MAP_TILES.url} maxZoom={DARK_MAP_TILES.maxZoom} className="dark-tiles-text" />
    <TileLayer url={DARK_MAP_TILES.url} maxZoom={DARK_MAP_TILES.maxZoom} className="dark-tiles-glow" />
  </>
);

export default DarkTileLayers;
