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
      <h1 className="text-2xl font-semibold mb-6">Registrar Nueva Casa</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card">
          <h3 className="mb-4">Datos Generales</h3>
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
            
            <div className="form-group">
              <label className="form-label">Estado de Visita</label>
              <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}>
                <option value="Pendiente">Pendiente</option>
                <option value="Atendido">Atendido</option>
                <option value="No atendió">No atendió</option>
                <option value="No tocar">No tocar</option>
                <option value="Solo fines de semana">Solo fines de semana</option>
              </select>
            </div>

            <h3 className="mt-6 mb-4">Residentes y Casos</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="form-group flex-1">
                <label className="form-label">Nombre del Contacto</label>
                <input value={formData.nombre_contacto} onChange={e => setFormData({...formData, nombre_contacto: e.target.value})} placeholder="Opcional" />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">Teléfono</label>
                <input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="Opcional" />
              </div>
            </div>

            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="w-auto" checked={formData.tiene_caso_especial} onChange={e => setFormData({...formData, tiene_caso_especial: e.target.checked})} />
                Marcar como caso especial
              </label>
            </div>

            {formData.tiene_caso_especial && (
              <div className="p-4 bg-red-50 rounded-lg mb-4">
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

            <h3 className="mt-6 mb-4">Evidencia Fotográfica</h3>
            <div className="form-group">
              <input
                id="photoInput"
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files[0])}
                className="border-2 border-dashed border-gray-200 p-4 text-center cursor-pointer bg-gray-50 w-full rounded-lg"
              />
            </div>

            <button type="submit" className="btn btn-primary w-full mt-4" disabled={isUploading}>
              {isUploading ? 'Subiendo datos y foto...' : 'Guardar Casa'}
            </button>
          </form>
        </div>

        <div className="card flex flex-col">
          <h3 className="mb-4">Geolocalización</h3>
          <p className="text-sm mb-4">Haz clic en el mapa para posicionar la casa.</p>

          {insideTerritory === true && (
            <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg mb-4 text-sm">
              ✓ Ubicación correcta dentro del territorio seleccionado.
            </div>
          )}
          {insideTerritory === false && formData.territorio_id && (
            <div className="p-2 bg-red-50 text-red-800 rounded-lg mb-4 text-sm">
              ⚠️ Ubicación fuera del territorio seleccionado.
            </div>
          )}

          <div className="flex-1 min-h-72 sm:min-h-96 rounded-lg overflow-hidden">
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
