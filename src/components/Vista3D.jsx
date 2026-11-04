import React, { Component, Suspense, useEffect, useState } from 'react';
import { t } from '../i18n';

// Elección entre mapa 3D (MapLibre, móvil) y vista clásica (Leaflet) — la usan el mapa principal y
// "Registrar casa". 3D solo si la pantalla es < md (768px) y hay WebGL2; el usuario puede elegir la
// clásica y se recuerda para todos los mapas (localStorage 'vista_mapas').
// Si la vista 3D truena (chunk sin red, error de WebGL…) se cae a la clásica, nunca pantalla en blanco.

const VISTA_KEY = 'vista_mapas'; // '3d' | 'clasica'
const VISTA_KEY_VIEJA = 'registro_vista';
const MQ_MOVIL = '(max-width: 767px)';

const leerVista = () => {
  try { return localStorage.getItem(VISTA_KEY) || localStorage.getItem(VISTA_KEY_VIEJA); } catch { return null; }
};

const soportaWebGL2 = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // liberar el contexto de prueba
    return !!gl;
  } catch { return false; }
};

const useEsMovil = () => {
  const [esMovil, setEsMovil] = useState(() => !!window.matchMedia?.(MQ_MOVIL).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MQ_MOVIL);
    if (!mq?.addEventListener) return undefined;
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return esMovil;
};

class Fallo3D extends Component {
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
 * Pinta la vista 3D o la clásica.
 *  - Vista3DComp: componente lazy (recibe onVistaClasica)
 *  - render(onVista3D): la vista clásica; onVista3D es null si este equipo no puede usar 3D
 */
const ElegirVista = ({ Vista3DComp, render, props3D }) => {
  const esMovil = useEsMovil();
  const [webgl] = useState(soportaWebGL2);
  const [vista, setVista] = useState(() => leerVista() || '3d');
  const [fallo, setFallo] = useState(false); // solo esta vez; la próxima visita lo vuelve a intentar

  const elegirVista = (v) => {
    setVista(v);
    setFallo(false);
    try { localStorage.setItem(VISTA_KEY, v); } catch { /* sin storage */ }
  };

  const puede3D = esMovil && webgl;

  if (puede3D && vista === '3d' && !fallo) {
    return (
      <Fallo3D onError={() => setFallo(true)}>
        <Suspense fallback={<CargandoMapa3D />}>
          <Vista3DComp {...props3D} onVistaClasica={() => elegirVista('clasica')} />
        </Suspense>
      </Fallo3D>
    );
  }
  return render(puede3D ? () => elegirVista('3d') : null);
};

export default ElegirVista;
