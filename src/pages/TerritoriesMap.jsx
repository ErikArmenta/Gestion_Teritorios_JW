import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet-draw';
import { useData } from '../context/DataContext';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const CustomEditControl = ({ onCreated }) => {
  const map = useMap();

  useEffect(() => {
    if (map.__drawControlAdded) return;
    map.__drawControlAdded = true;

    const drawControl = new L.Control.Draw({
      draw: {
        polyline: false,
        polygon: true,
        circle: false,
        circlemarker: false,
        marker: false,
        rectangle: true
      },
      edit: false
    });

    map.addControl(drawControl);

    const onDrawCreated = (e) => {
      if (onCreated) onCreated(e);
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);

    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      map.__drawControlAdded = false;
    };
  }, [map, onCreated]);

  return null;
};

const GlobalMapFitter = ({ territorios }) => {
  const map = useMap();
  useEffect(() => {
    if (territorios && territorios.length > 0) {
      let allLatLngs = [];
      territorios.forEach(t => {
        if (t.coordenadas && Array.isArray(t.coordenadas)) {
          allLatLngs = allLatLngs.concat(t.coordenadas);
        }
      });
      if (allLatLngs.length > 0) {
        try {
          const bounds = L.latLngBounds(allLatLngs);
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        } catch(e) {
          console.error("Error centering map", e);
        }
      }
    }
  }, [territorios, map]);
  
  return null;
};

const TerritoriesMap = () => {
  const { territorios, casas, addTerritorio, loading } = useData();
  const [newPolygonCoords, setNewPolygonCoords] = useState(null);
  
  // Estado del modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '', descripcion: '', responsable: '', color: '#3B82F6'
  });

  const _onCreated = (e) => {
    const { layerType, layer } = e;
    if (layerType === 'polygon' || layerType === 'rectangle') {
      const latlngs = layer.getLatLngs()[0];
      const coords = latlngs.map(ll => [ll.lat, ll.lng]);
      setNewPolygonCoords(coords);
      setShowModal(true);
      // Eliminar la capa dibujada porque se renderizará desde DB al guardar
      layer.remove();
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newPolygonCoords) return;
    
    const newTerritory = {
      nombre: formData.nombre,
      descripcion: formData.descripcion,
      responsable: formData.responsable,
      color: formData.color,
      coordenadas: newPolygonCoords,
    };
    
    try {
      await addTerritorio(newTerritory);
      setShowModal(false);
      setFormData({ nombre: '', descripcion: '', responsable: '', color: '#3B82F6' });
      setNewPolygonCoords(null);
    } catch (err) {
      console.error("Error al guardar territorio:", err);
      alert("Hubo un error al guardar el territorio.");
    }
  };

  const createCustomIcon = (estado) => {
    const colors = {
      "Atendido": "#10B981",
      "No atendió": "#EF4444",
      "No tocar": "#1F2937",
      "Solo fines de semana": "#3B82F6",
      "Pendiente": "#F59E0B"
    };
    const color = colors[estado] || "gray";
    
    return L.divIcon({
      className: 'custom-marker-wrapper',
      html: `<div class="custom-marker" style="background-color: ${color};"></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -10]
    });
  };

  const getStatusColor = (estado) => {
    const colors = {
      "Atendido": { bg: '#ECFDF5', text: '#065F46' },
      "No atendió": { bg: '#FEF2F2', text: '#991B1B' },
      "No tocar": { bg: '#F3F4F6', text: '#1F2937' },
      "Solo fines de semana": { bg: '#EFF6FF', text: '#1E40AF' },
      "Pendiente": { bg: '#FFFBEB', text: '#B45309' }
    };
    return colors[estado] || { bg: '#f1f1f1', text: '#333' };
  };

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Mapa Principal y Territorios</h1>
          <p className="hidden sm:block">Dibuja polígonos para crear nuevos territorios y visualiza las casas registradas.</p>
        </div>
      </div>

      <div className="card flex-1 min-h-0 p-0 overflow-hidden relative">
        {loading ? (
          <div className="p-8 text-center">Cargando datos...</div>
        ) : (
          <MapContainer center={[31.7619, -106.4850]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <GlobalMapFitter territorios={territorios} />
            
            <FeatureGroup>
              <CustomEditControl onCreated={_onCreated} />
            </FeatureGroup>

            {territorios.map((t) => (
              <Polygon
                key={t.id}
                positions={t.coordenadas}
                pathOptions={{ color: t.color, fillColor: t.color, fillOpacity: 0.2, weight: 2 }}
                eventHandlers={{
                  mouseover: (e) => { e.target.setStyle({ fillOpacity: 0.5, weight: 3 }) },
                  mouseout: (e) => { e.target.setStyle({ fillOpacity: 0.2, weight: 2 }) }
                }}
              >
                <Popup>
                  <div className="p-2">
                    <h4 className="mb-2 font-semibold" style={{ color: t.color }}>{t.nombre}</h4>
                    <p className="mb-1 text-sm"><strong>Responsable:</strong> {t.responsable}</p>
                    <p className="text-sm">{t.descripcion}</p>
                  </div>
                </Popup>
              </Polygon>
            ))}

            <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
              {casas.map((c) => (
                <Marker
                  key={c.id}
                  position={[c.latitud, c.longitud]}
                  icon={createCustomIcon(c.estado)}
                >
                  <Popup className="ficha-tecnica">
                    <div className="min-w-[180px] max-w-[260px]">
                      {c.foto_url ? (
                        <div className="w-full h-36 mb-3 rounded-md overflow-hidden">
                          <img src={c.foto_url} alt="Casa" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full h-10 bg-gray-100 rounded-md mb-3 flex items-center justify-center text-gray-400 text-xs">
                          Sin foto adjunta
                        </div>
                      )}

                      <h4 className="mb-2 text-[1.1rem] font-semibold">{c.direccion}</h4>

                      <div className="mb-3">
                        <span className="badge" style={{ backgroundColor: getStatusColor(c.estado).bg, color: getStatusColor(c.estado).text }}>
                          {c.estado}
                        </span>
                      </div>

                      <div className="text-sm text-[var(--text-secondary)]">
                        <p className="mb-1"><strong>Contacto:</strong> {c.nombre_contacto || 'N/A'}</p>
                        <p className="mb-1"><strong>Tel:</strong> {c.telefono || 'N/A'}</p>
                        <p><strong>Zona:</strong> {c.territorio_nombre}</p>
                      </div>

                      {c.tiene_caso_especial && (
                        <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-800">
                          <strong>⚠️ Especial ({c.tipo_caso}):</strong> {c.detalles_caso}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-6">Nuevo Territorio</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej: Zona Norte" />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Responsable</label>
                <input required value={formData.responsable} onChange={e => setFormData({...formData, responsable: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="h-10 p-1 w-full" />
              </div>
              <div className="flex gap-4 mt-6">
                <button type="button" className="btn btn-outline flex-1" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TerritoriesMap;
