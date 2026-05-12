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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>Mapa Principal y Territorios</h1>
          <p>Dibuja polígonos para crear nuevos territorios y visualiza las casas registradas.</p>
        </div>
      </div>

      <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando datos...</div>
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
                  <div style={{ padding: '0.5rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: t.color }}>{t.nombre}</h4>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem' }}><strong>Responsable:</strong> {t.responsable}</p>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>{t.descripcion}</p>
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
                    <div style={{ minWidth: '220px', maxWidth: '280px' }}>
                      {c.foto_url ? (
                        <div style={{ width: '100%', height: '140px', marginBottom: '0.75rem', borderRadius: '6px', overflow: 'hidden' }}>
                          <img src={c.foto_url} alt="Casa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: '40px', backgroundColor: '#F3F4F6', borderRadius: '6px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '0.75rem' }}>
                          Sin foto adjunta
                        </div>
                      )}
                      
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{c.direccion}</h4>
                      
                      <div style={{ marginBottom: '0.75rem' }}>
                        <span className="badge" style={{ backgroundColor: getStatusColor(c.estado).bg, color: getStatusColor(c.estado).text }}>
                          {c.estado}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <p style={{ margin: '0 0 0.25rem 0' }}><strong>Contacto:</strong> {c.nombre_contacto || 'N/A'}</p>
                        <p style={{ margin: '0 0 0.25rem 0' }}><strong>Tel:</strong> {c.telefono || 'N/A'}</p>
                        <p style={{ margin: 0 }}><strong>Zona:</strong> {c.territorio_nombre}</p>
                      </div>

                      {c.tiene_caso_especial && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem', backgroundColor: '#FEF2F2', borderRadius: '4px', fontSize: '0.75rem', color: '#991B1B' }}>
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
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Nuevo Territorio</h3>
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
                <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={{ height: '40px', padding: '0.2rem' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TerritoriesMap;
