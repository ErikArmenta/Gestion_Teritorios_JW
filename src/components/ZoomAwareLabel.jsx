import { Marker } from 'react-leaflet';
import L from 'leaflet';

const calcCentroid = (coordenadas) => {
  if (!coordenadas?.length) return null;
  const lat = coordenadas.reduce((sum, c) => sum + c[0], 0) / coordenadas.length;
  const lng = coordenadas.reduce((sum, c) => sum + c[1], 0) / coordenadas.length;
  return [lat, lng];
};

const getZoomStyle = (zoom) => {
  if (zoom >= 16) return { fontSize: '18px', opacity: 1, showName: true };
  if (zoom >= 14) return { fontSize: '15px', opacity: 1, showName: false };
  if (zoom >= 12) return { fontSize: '12px', opacity: 0.7, showName: false };
  return { fontSize: '10px', opacity: 0.5, showName: false };
};

const ZoomAwareLabel = ({ coordenadas, numero, nombre, color = '#3b82f6', isManzana = false, zoom }) => {
  const centroid = calcCentroid(coordenadas);
  if (!centroid) return null;

  const { fontSize, opacity, showName } = getZoomStyle(zoom);
  const label = numero || nombre || '';
  const displayName = nombre && nombre !== numero ? nombre : null;

  const baseFontSize = parseFloat(fontSize);
  const actualFontSize = isManzana ? `${Math.round(baseFontSize * 0.7)}px` : fontSize;

  const text = showName && displayName ? `${label} ${displayName}` : label;

  const bgOpacity = isManzana ? 0.75 : 0.85;
  const borderStyle = isManzana
    ? 'border: none;'
    : 'border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 1px 3px rgba(0,0,0,0.1);';

  // Estimar ancho del texto para centrar el iconAnchor
  const estimatedWidth = Math.max(text.length * (baseFontSize * 0.5), 30);
  const estimatedHeight = baseFontSize + 8;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      font-weight: 700;
      color: #1E293B;
      text-shadow: 0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.6);
      background: rgba(255,255,255,${bgOpacity});
      border-radius: 6px;
      padding: 3px 8px;
      font-size: ${actualFontSize};
      opacity: ${opacity};
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.3;
      user-select: none;
      letter-spacing: 0.3px;
      ${borderStyle}
    ">${text}</div>`,
    iconSize: [0, 0],
    iconAnchor: [Math.round(estimatedWidth / 2), Math.round(estimatedHeight / 2)],
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
