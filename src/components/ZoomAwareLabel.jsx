import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { PROGRESO } from '../utils/territoryProgress';
import { t } from '../i18n';

// Etiqueta de territorio / manzana sobre el mapa.
// Estilos en index.css (.terr-label, .mz-label). El centrado es con CSS
// (translate -50%), así no hay que estimar el ancho del texto.

const calcCentroid = (coordenadas) => {
  if (!coordenadas?.length) return null;
  const lat = coordenadas.reduce((sum, c) => sum + c[0], 0) / coordenadas.length;
  const lng = coordenadas.reduce((sum, c) => sum + c[1], 0) / coordenadas.length;
  return [lat, lng];
};

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Tamaño según zoom: lejos solo el número; cerca, número + nombre
const getSize = (zoom) => {
  if (zoom >= 16) return 'lg';
  if (zoom >= 14) return 'md';
  return 'sm';
};

const ZoomAwareLabel = ({ coordenadas, numero, nombre, color = '#3b82f6', isManzana = false, zoom, minZoom = 0, progreso }) => {
  const centroid = calcCentroid(coordenadas);
  if (!centroid) return null;

  // Por debajo de minZoom la etiqueta la "absorbe" el cluster de casas
  if (zoom < minZoom) return null;
  // Manzanas: solo con zoom cercano, si no se amontonan
  if (isManzana && zoom < 17) return null;

  let html;
  if (isManzana) {
    html = `<div class="mz-label" style="--c:${escapeHtml(color)}">${escapeHtml(nombre || numero)}</div>`;
  } else {
    // "numero" a veces es un número corto ("10") y a veces el nombre completo
    const num = String(numero ?? '').trim();
    const name = String(nombre ?? '').trim();
    const shortNum = num && num.length <= 4 ? num : '';
    const title = name && name !== num ? name : (shortNum ? '' : num || name);
    const size = getSize(zoom);
    const showTitle = size !== 'sm' && title;

    html = `<div class="terr-label terr-label--${size}" style="--c:${escapeHtml(color)}">`
      + (shortNum ? `<span class="terr-label__num">${escapeHtml(shortNum)}</span>` : '')
      + (showTitle || !shortNum ? `<span class="terr-label__name">${escapeHtml(title || name || num)}</span>` : '')
      + (progreso
        ? `<span class="terr-label__pct" style="--p:${PROGRESO[progreso.estado]?.color || '#94A3B8'}" title="${escapeHtml(t(PROGRESO[progreso.estado]?.label || ''))}">${progreso.pct}%</span>`
        : '')
      + `</div>`;
  }

  const icon = L.divIcon({
    className: 'map-label-anchor',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  return (
    <Marker
      position={centroid}
      icon={icon}
      interactive={false}
      zIndexOffset={-1000}
      bubblingMouseEvents={true}
    />
  );
};

export default ZoomAwareLabel;
