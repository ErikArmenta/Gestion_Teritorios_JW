import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import * as turf from '@turf/turf';
import { MapPin, Check, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useToast } from './Toast';
import MapaConRespaldo from './MapaConRespaldo';
import DarkTileLayers from './DarkTileLayers';
import LocateButton from './LocateButton';
import { t as tx } from '../i18n';

// Punto de reunión (opcional) de un link compartido — Migración 8 (MIGRACION_8_PUNTO_REUNION.sql).
// Se pone después de crear el link: mapa con pin al centro + una nota; se guarda en territorio_compartidos.
// El link compartido lo muestra y "Cómo llegar" lleva ahí.

// Centro del territorio ([[lat, lng], ...] como Leaflet) para abrir el mapa
const centroDe = (coordenadas) => {
  try {
    const anillo = coordenadas.map(([lat, lng]) => [Number(lng), Number(lat)]);
    anillo.push(anillo[0]);
    const [lng, lat] = turf.centroid(turf.polygon([anillo])).geometry.coordinates;
    return { lat, lng };
  } catch { return null; }
};

const ICONO = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const MarcadorArrastrable = ({ posicion, onCambiar }) => {
  useMapEvents({ click(e) { onCambiar(e.latlng); } });
  return posicion ? (
    <Marker position={posicion} icon={ICONO} draggable eventHandlers={{ dragend(e) { onCambiar(e.target.getLatLng()); } }} />
  ) : null;
};

// Sin la Migración 8 PostgREST responde "columna no encontrada"
const faltaMigracion = (err) => err?.code === 'PGRST204' || err?.code === '42703' || /punto_reunion/.test(err?.message || '');

const PuntoReunionCompartido = ({ compartidoId, coordenadas }) => {
  const toast = useToast();
  const inicial = useMemo(() => centroDe(coordenadas || []) || { lat: 31.7619, lng: -106.485 }, [coordenadas]);
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(inicial);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('territorio_compartidos')
        .update({
          punto_reunion_lat: Number(posicion.lat.toFixed(7)),
          punto_reunion_lng: Number(posicion.lng.toFixed(7)),
          punto_reunion_nota: nota.trim() || null,
        })
        .eq('id', compartidoId);
      if (error) throw error;
      setGuardado(true);
      setAbierto(false);
      toast.success(tx('Punto de reunión guardado'));
    } catch (err) {
      if (faltaMigracion(err)) toast.warning(tx('Falta correr la Migración 8 en Supabase (MIGRACION_8_PUNTO_REUNION.sql).'));
      else toast.error(tx('Error al guardar: ') + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <button type="button" className="btn btn-outline w-full mb-4" onClick={() => setAbierto(true)}>
        {guardado ? <Check size={14} style={{ color: '#10B981' }} /> : <MapPin size={14} />}
        {guardado ? tx('Punto de reunión guardado · cambiar') : tx('Agregar punto de reunión (opcional)')}
      </button>
    );
  }

  return (
    <div className="form-group">
      <label className="form-label">{tx('Punto de reunión')}</label>
      <p className="text-xs mb-2" style={{ color: '#64748B' }}>{tx('Mueve el mapa hasta dejar el pin donde se juntan.')}</p>
      <div className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
        <MapaConRespaldo
          modo="selector"
          posicion={posicion}
          onCambiar={setPosicion}
          alto="220px"
          clasico={(
            <div style={{ height: 220 }}>
              <MapContainer center={[posicion.lat, posicion.lng]} zoom={16} style={{ height: '100%', width: '100%' }}>
                <DarkTileLayers />
                <MarcadorArrastrable posicion={posicion} onCambiar={setPosicion} />
                <LocateButton onLocate={setPosicion} />
              </MapContainer>
            </div>
          )}
        />
      </div>
      <input
        value={nota}
        onChange={e => setNota(e.target.value)}
        maxLength={140}
        placeholder={tx('Nota (opcional). Ej: afuera de la tienda de la esquina')}
        className="mb-2"
      />
      <div className="flex gap-2">
        <button type="button" className="btn btn-outline flex-1" onClick={() => setAbierto(false)} disabled={guardando}>{tx('Cancelar')}</button>
        <button type="button" className="btn btn-primary flex-1" onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {tx('Guardar punto')}
        </button>
      </div>
    </div>
  );
};

export default PuntoReunionCompartido;
