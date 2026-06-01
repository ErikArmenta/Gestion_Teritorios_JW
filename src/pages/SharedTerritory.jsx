import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import { supabase } from '../supabaseClient';
import { STATUS_COLORS } from '../utils/constants';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const createHouseIcon = (estado) => {
  const color = STATUS_COLORS[estado]?.hex || '#9CA3AF';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" width="28" height="32">
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
      <g filter="url(#shadow)">
        <path d="M16 2 L3 14 L6 14 L6 30 L26 30 L26 14 L29 14 Z"
              fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        <rect x="12" y="19" width="8" height="11" rx="1" fill="white" opacity="0.35"/>
      </g>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'house-marker-icon',
    iconSize: [28, 32],
    iconAnchor: [14, 32],
    popupAnchor: [0, -30],
  });
};

const MapFitter = ({ coordenadas }) => {
  const map = useMap();
  useEffect(() => {
    if (!coordenadas?.length) return;
    try {
      map.fitBounds(L.latLngBounds(coordenadas), { padding: [40, 40], maxZoom: 17 });
    } catch {}
  }, [coordenadas, map]);
  return null;
};

export default function SharedTerritory() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'invalid' | 'expired' | 'valid'
  const [territorio, setTerritorio] = useState(null);
  const [casas, setCasas] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('territorio_compartidos')
        .select('*, territorios(*)')
        .eq('id', id)
        .single();

      if (error || !data) {
        setStatus('invalid');
        return;
      }

      if (new Date(data.expira_en) < new Date()) {
        setStatus('expired');
        return;
      }

      setTerritorio(data.territorios);

      const { data: casasData } = await supabase
        .from('casas')
        .select('*')
        .eq('territorio_id', data.territorios.id);

      setCasas(casasData || []);
      setStatus('valid');
    };

    load();
  }, [id]);

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-surface, #F8FAFC)',
      }}>
        <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.95rem' }}>
          Cargando territorio...
        </p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-surface, #F8FAFC)',
        gap: '12px',
      }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
          Enlace no válido
        </p>
        <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.875rem' }}>
          Este enlace no existe o fue eliminado.
        </p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-surface, #F8FAFC)',
        gap: '12px',
      }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
          Este enlace ha expirado
        </p>
        <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.875rem' }}>
          Solicita un nuevo enlace al administrador del territorio.
        </p>
      </div>
    );
  }

  const coordenadas = territorio?.coordenadas || [];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-surface, #F8FAFC)',
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        background: 'var(--bg-card, #FFFFFF)',
        borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.07))',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: territorio?.color || '#2563EB',
            flexShrink: 0,
          }}
        />
        <div>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted, #94A3B8)',
            marginBottom: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Territorio Compartido
          </p>
          <h1 style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: 'var(--text-primary, #0F172A)',
            margin: 0,
          }}>
            {territorio?.nombre || 'Territorio'}
          </h1>
        </div>
        {casas.length > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.75rem',
            color: 'var(--text-secondary, #475569)',
            background: 'var(--bg-hover, rgba(0,0,0,0.04))',
            padding: '4px 10px',
            borderRadius: '9999px',
            border: '1px solid var(--border-color, rgba(0,0,0,0.07))',
          }}>
            {casas.length} {casas.length === 1 ? 'casa' : 'casas'}
          </span>
        )}
      </header>

      {/* Map */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <MapContainer
          center={coordenadas.length > 0 ? coordenadas[0] : [20.659698, -103.349609]}
          zoom={14}
          style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 72px)' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          {coordenadas.length > 0 && (
            <>
              <MapFitter coordenadas={coordenadas} />
              <Polygon
                positions={coordenadas}
                pathOptions={{
                  color: territorio?.color || '#2563EB',
                  fillColor: territorio?.color || '#2563EB',
                  fillOpacity: 0.15,
                  weight: 2.5,
                }}
              />
            </>
          )}

          {casas.map((casa) => {
            const lat = parseFloat(casa.latitud);
            const lng = parseFloat(casa.longitud);
            if (!lat || !lng || (lat === 0 && lng === 0)) return null;
            return (
              <Marker
                key={casa.id}
                position={[lat, lng]}
                icon={createHouseIcon(casa.estado)}
              >
                <Popup>
                  <div style={{ minWidth: '180px', fontSize: '13px' }}>
                    <p style={{ fontWeight: 600, marginBottom: '4px', color: '#0F172A' }}>
                      {casa.direccion}
                    </p>
                    {casa.estado && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: STATUS_COLORS[casa.estado]?.hex + '20' || '#F1F5F9',
                        color: STATUS_COLORS[casa.estado]?.hex || '#475569',
                        marginBottom: '6px',
                      }}>
                        {casa.estado}
                      </span>
                    )}
                    {casa.nombre_contacto && (
                      <p style={{ color: '#475569', marginTop: '4px' }}>
                        {casa.nombre_contacto}
                      </p>
                    )}
                    {casa.notas && (
                      <p style={{ color: '#64748B', fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>
                        {casa.notas}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
