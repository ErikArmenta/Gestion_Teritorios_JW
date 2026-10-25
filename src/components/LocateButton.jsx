import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap, CircleMarker, Circle } from 'react-leaflet';
import { Navigation } from 'lucide-react';
import { t } from '../i18n';

// Botón "Mi ubicación" para cualquier MapContainer.
// Es un control nativo de Leaflet (arriba a la izquierda, debajo del zoom y de las
// herramientas de dibujo), así nunca se encima con otros controles.
// 1er clic: centra el mapa en tu posición y la sigue en tiempo real (punto azul).
// 2do clic: deja de seguir. `onLocate` se llama solo con la primera posición
// (para formularios que usan la ubicación como punto seleccionado).
// También ajusta el mapa cuando cambia el tamaño de su contenedor
// (evita la franja gris/blanca cuando el layout crece después de montar).
const LocateButton = ({ onLocate, zoom = 17 }) => {
  const map = useMap();
  const [container, setContainer] = useState(null);
  const [status, setStatus] = useState('off'); // off | locating | tracking
  const [pos, setPos] = useState(null);
  const watchId = useRef(null);
  const firstFix = useRef(true);

  // Control de Leaflet donde se "porta" el botón
  useEffect(() => {
    const control = L.control({ position: 'topleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar locate-control');
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    control.addTo(map);
    setContainer(control.getContainer());
    return () => control.remove();
  }, [map]);

  // Recalcular tamaño del mapa cuando su contenedor cambia de alto/ancho
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const stop = () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setStatus('off');
    setPos(null);
  };

  const handleClick = () => {
    if (status !== 'off') { stop(); return; }
    if (!navigator.geolocation) {
      alert(t('Tu navegador no soporta geolocalización'));
      return;
    }
    firstFix.current = true;
    setStatus('locating');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const latlng = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos({ ...latlng, accuracy: p.coords.accuracy });
        setStatus('tracking');
        if (firstFix.current) {
          firstFix.current = false;
          map.flyTo(latlng, Math.max(map.getZoom(), zoom), { animate: true, duration: 1.2 });
          if (onLocate) onLocate(latlng);
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        alert(t('No se pudo obtener tu ubicación. Verifica los permisos.'));
        stop();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const active = status === 'tracking';
  const label = active ? t('Dejar de seguir mi ubicación') : t('Ir a mi ubicación');

  return (
    <>
      {pos && (
        <>
          {pos.accuracy < 500 && (
            <Circle
              center={pos}
              radius={pos.accuracy}
              interactive={false}
              pathOptions={{ color: '#3B82F6', weight: 1, opacity: 0.5, fillColor: '#3B82F6', fillOpacity: 0.12 }}
            />
          )}
          <CircleMarker
            center={pos}
            radius={8}
            interactive={false}
            className="my-location-dot"
            pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }}
          />
        </>
      )}
      {container && createPortal(
        <button
          type="button"
          onClick={handleClick}
          className={`locate-control__btn${active ? ' is-active' : ''}${status === 'locating' ? ' is-locating' : ''}`}
          title={label}
          aria-label={label}
        >
          <Navigation size={16} fill={active ? 'currentColor' : 'none'} />
        </button>,
        container
      )}
    </>
  );
};

export default LocateButton;
