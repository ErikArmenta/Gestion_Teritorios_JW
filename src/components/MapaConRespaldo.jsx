import React, { lazy, Suspense, useState } from 'react';
import { Fallo3D } from './Vista3D';
import { soportaWebGL2 } from '../utils/webgl';

// Mapa pequeño dentro de una página o modal: 3D (MapLibre, se carga aparte) con respaldo.
// `clasico` = el mapa Leaflet de siempre (elemento React): se usa si no hay WebGL2 o si el 3D falla.
// El resto de props van a components/Mapa3DEmbebido.jsx (modo, posicion, onCambiar, puntos, alto…).
const Mapa3DEmbebido = lazy(() => import('./Mapa3DEmbebido'));

const MapaConRespaldo = ({ clasico, alto = 'min(450px, 55dvh)', ...props3D }) => {
  const [webgl] = useState(soportaWebGL2);
  const [fallo, setFallo] = useState(false);

  if (!webgl || fallo) return clasico;
  return (
    <Fallo3D onError={() => setFallo(true)}>
      <Suspense fallback={<div className="m3d-embebido m3d-embebido--cargando" style={{ height: alto }} />}>
        <Mapa3DEmbebido alto={alto} {...props3D} onFallo={() => setFallo(true)} />
      </Suspense>
    </Fallo3D>
  );
};

export default MapaConRespaldo;
