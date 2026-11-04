import React, { Component, Suspense, useState } from 'react';
import { soportaWebGL2 } from '../utils/webgl';
import { t } from '../i18n';

// Elección entre mapa 3D (MapLibre) y vista clásica (Leaflet) en las pantallas con mapa: mapa principal,
// "Registrar casa" y Territorios. El 3D es para todos (móvil y escritorio); la clásica queda solo como
// respaldo automático: sin WebGL2, o si la vista 3D truena (chunk sin red, error de WebGL…) — nunca
// pantalla en blanco. En ese caso la clásica muestra "Mapa 3D" para reintentar.
// Los links compartidos (/shared) y las alertas de pánico siguen en 2D (Leaflet) a propósito.

export class Fallo3D extends Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(err) {
    console.error('Vista 3D no disponible, se usa la clásica:', err);
    this.props.onError();
  }
  render() { return this.state.error ? null : this.props.children; }
}

const CargandoMapa3D = () => (
  <div className="m3d m3d--cargando">
    <div className="w-8 h-8 border-blue-200 border-t-blue-500 rounded-full animate-spin" style={{ borderWidth: 3 }} />
    <p className="text-sm text-secondary">{t('Cargando mapa...')}</p>
  </div>
);

/**
 * Pinta la vista 3D o, como respaldo, la clásica.
 *  - Vista3DComp: componente lazy (recibe onVistaClasica: se llama si el mapa no se puede crear)
 *  - render(onVista3D): la vista clásica; onVista3D (reintentar el 3D) es null si no hay WebGL2
 */
const ElegirVista = ({ Vista3DComp, render, props3D }) => {
  const [webgl] = useState(soportaWebGL2);
  const [fallo, setFallo] = useState(false); // solo esta vez; la próxima visita lo vuelve a intentar

  if (webgl && !fallo) {
    return (
      <Fallo3D onError={() => setFallo(true)}>
        <Suspense fallback={<CargandoMapa3D />}>
          <Vista3DComp {...props3D} onVistaClasica={() => setFallo(true)} />
        </Suspense>
      </Fallo3D>
    );
  }
  return render(webgl ? () => setFallo(false) : null);
};

export default ElegirVista;
