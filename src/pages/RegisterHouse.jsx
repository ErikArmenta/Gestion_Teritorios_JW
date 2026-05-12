import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { MapContainer, TileLayer, Marker, useMapEvents, Polygon, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import * as turf from '@turf/turf';

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

const LocationMarker = ({ position, setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
};

const MapCenterer = ({ territorioObj }) => {
  const map = useMap();
  useEffect(() => {
    if (territorioObj && territorioObj.coordenadas && territorioObj.coordenadas.length > 0) {
      const bounds = L.latLngBounds(territorioObj.coordenadas);
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    }
  }, [territorioObj, map]);
  return null;
};

const RegisterHouse = () => {
  const { territorios, casas, addCasa, uploadPhoto } = useData();
  const [position, setPosition] = useState({ lat: 31.7619, lng: -106.4850 });
  const [photoFile, setPhotoFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    territorio_id: '',
    direccion: '',
    estado: 'Pendiente',
    nombre_contacto: '',
    telefono: '',
    tiene_caso_especial: false,
    tipo_caso: '',
    detalles_caso: '',
    notas: ''
  });

  const checkInPolygon = () => {
    if (!formData.territorio_id) return null;
    const territorio = territorios.find(t => String(t.id) === String(formData.territorio_id));
    if (!territorio || !territorio.coordenadas || territorio.coordenadas.length < 3) return null;

    try {
      const pt = turf.point([position.lng, position.lat]);
      // Turf expects [lng, lat] and a closed polygon
      let coords = territorio.coordenadas.map(c => [c[1], c[0]]);
      if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
        coords.push(coords[0]); // cerrar polígono
      }
      const poly = turf.polygon([coords]);
      return turf.booleanPointInPolygon(pt, poly);
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const insideTerritory = useMemo(() => checkInPolygon(), [position, formData.territorio_id, territorios]);
  
  const casasEnTerritorio = useMemo(() => {
    return casas ? casas.filter(c => String(c.territorio_id) === String(formData.territorio_id)) : [];
  }, [casas, formData.territorio_id]);

  const getStatusColor = (estado) => {
    const colors = {
      "Atendido": "#10B981",
      "No atendió": "#EF4444",
      "No tocar": "#1F2937",
      "Solo fines de semana": "#3B82F6",
      "Pendiente": "#F59E0B"
    };
    return colors[estado] || "#9CA3AF";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (insideTerritory === false) {
      if(!window.confirm("La ubicación seleccionada NO está dentro del territorio. ¿Deseas guardarla de todos modos?")) {
        return;
      }
    }
    
    setIsUploading(true);
    try {
      const territorio = territorios.find(t => String(t.id) === String(formData.territorio_id));
      let photoUrl = null;
      if (photoFile) {
        photoUrl = await uploadPhoto(photoFile);
      }

      const nuevaCasa = {
        territorio_id: parseInt(formData.territorio_id, 10),
        direccion: formData.direccion,
        estado: formData.estado,
        nombre_contacto: formData.nombre_contacto,
        telefono: formData.telefono,
        tiene_caso_especial: formData.tiene_caso_especial,
        tipo_caso: formData.tipo_caso,
        detalles_caso: formData.detalles_caso,
        notas: formData.notas,
        territorio_nombre: territorio ? territorio.nombre : '',
        latitud: position.lat,
        longitud: position.lng,
        foto_url: photoUrl
      };

      await addCasa(nuevaCasa);
      alert("Casa registrada exitosamente!");
      setFormData({
        territorio_id: '',
        direccion: '',
        estado: 'Pendiente',
        nombre_contacto: '',
        telefono: '',
        tiene_caso_especial: false,
        tipo_caso: '',
        detalles_caso: '',
        notas: ''
      });
      setPhotoFile(null);
      // Reset input file
      document.getElementById('photoInput').value = "";
    } catch(err) {
      console.error(err);
      alert("Error: " + (err.message || JSON.stringify(err)));
    } finally {
      setIsUploading(false);
    }
  };

  const selectedTerritoryObj = territorios.find(t => String(t.id) === String(formData.territorio_id));

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Registrar Nueva Casa</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Datos Generales</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Territorio</label>
              <select required value={formData.territorio_id} onChange={e => setFormData({...formData, territorio_id: e.target.value})}>
                <option value="">Selecciona un territorio...</option>
                {territorios.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Dirección Completa</label>
              <input required value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} placeholder="Ej: Calle Principal 123" />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Estado de Visita</label>
                <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Atendido">Atendido</option>
                  <option value="No atendió">No atendió</option>
                  <option value="No tocar">No tocar</option>
                  <option value="Solo fines de semana">Solo fines de semana</option>
                </select>
              </div>
            </div>

            <h3 style={{ margin: '1.5rem 0 1rem' }}>Residentes y Casos</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Nombre del Contacto</label>
                <input value={formData.nombre_contacto} onChange={e => setFormData({...formData, nombre_contacto: e.target.value})} placeholder="Opcional" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Teléfono</label>
                <input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="Opcional" />
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={formData.tiene_caso_especial} onChange={e => setFormData({...formData, tiene_caso_especial: e.target.checked})} />
                Marcar como caso especial
              </label>
            </div>

            {formData.tiene_caso_especial && (
              <div style={{ padding: '1rem', backgroundColor: '#FEF2F2', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Tipo de Caso</label>
                  <select value={formData.tipo_caso} onChange={e => setFormData({...formData, tipo_caso: e.target.value})}>
                    <option value="">Seleccionar...</option>
                    <option value="Expulsado">Expulsado</option>
                    <option value="Censurado">Censurado</option>
                    <option value="Disciplinado">Disciplinado</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Detalles</label>
                  <textarea value={formData.detalles_caso} onChange={e => setFormData({...formData, detalles_caso: e.target.value})} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notas Generales</label>
              <textarea value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} />
            </div>

            <h3 style={{ margin: '1.5rem 0 1rem' }}>Evidencia Fotográfica</h3>
            <div className="form-group">
              <input 
                id="photoInput"
                type="file" 
                accept="image/*" 
                onChange={(e) => setPhotoFile(e.target.files[0])}
                style={{ border: '2px dashed var(--border-color)', padding: '1rem', textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isUploading} style={{ width: '100%', marginTop: '1rem' }}>
              {isUploading ? 'Subiendo datos y foto...' : 'Guardar Casa'}
            </button>
          </form>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '1rem' }}>Geolocalización</h3>
          <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Haz clic en el mapa para posicionar la casa.</p>
          
          {insideTerritory === true && (
            <div style={{ padding: '0.5rem', backgroundColor: '#ECFDF5', color: '#065F46', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ✓ Ubicación correcta dentro del territorio seleccionado.
            </div>
          )}
          {insideTerritory === false && formData.territorio_id && (
            <div style={{ padding: '0.5rem', backgroundColor: '#FEF2F2', color: '#991B1B', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ⚠️ Ubicación fuera del territorio seleccionado.
            </div>
          )}

          <div style={{ flex: 1, minHeight: '400px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <MapContainer center={[31.7619, -106.4850]} zoom={14} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationMarker position={position} setPosition={setPosition} />
              <MapCenterer territorioObj={selectedTerritoryObj} />
              
              {selectedTerritoryObj && selectedTerritoryObj.coordenadas && (
                <Polygon
                  positions={selectedTerritoryObj.coordenadas}
                  pathOptions={{ color: selectedTerritoryObj.color, fillOpacity: 0.2 }}
                />
              )}

              {casasEnTerritorio.map(c => (
                <CircleMarker 
                  key={c.id} 
                  center={[c.latitud, c.longitud]} 
                  radius={6} 
                  pathOptions={{ color: '#ffffff', fillColor: getStatusColor(c.estado), fillOpacity: 1, weight: 2 }}
                >
                  <Tooltip direction="top" offset={[0, -5]}>
                    <div style={{ fontSize: '12px' }}>
                      <strong>{c.direccion}</strong><br/>
                      <span style={{ color: getStatusColor(c.estado) }}>{c.estado}</span>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterHouse;
