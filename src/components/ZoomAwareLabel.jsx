import { useState } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
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

const ZoomAwareLabel = ({ coordenadas, numero, nombre, color = '#3b82f6', isManzana = false }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const centroid = calcCentroid(coordenadas);
  if (!centroid) return null;

  const { fontSize, opacity, showName } = getZoomStyle(zoom);
  const label = numero || nombre || '';
  const displayName = nombre && nombre !== numero ? nombre : null;

  const baseFontSize = parseFloat(fontSize);
  const actualFontSize = isManzana ? `${Math.round(baseFontSize * 0.7)}px` : fontSize;

  const text = showName && displayName ? `${label} ${displayName}` : label;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      font-weight: bold;
      color: ${color};
      text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
      background: rgba(255,255,255,0.7);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: ${actualFontSize};
      opacity: ${opacity};
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.2;
      user-select: none;
    ">${text}</div>`,
    iconAnchor: [0, 0],
  });

  return (
    <Marker
      position={centroid}
      icon={icon}
      interactive={false}
      zIndexOffset={-100}
    />
  );
};

export default ZoomAwareLabel;
