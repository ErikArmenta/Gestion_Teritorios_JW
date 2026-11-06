import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { reportarError } from '../utils/errores';
import { t } from '../i18n';

// Si una pantalla truena, en vez de quedar en blanco se muestra este aviso (y el error se reporta).
// `clave` (la ruta) reinicia el aviso al cambiar de pantalla.
export default class ErrorPantalla extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportarError(error, info?.componentStack || '');
  }

  componentDidUpdate(prev) {
    if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Una versión nueva cambió los archivos: recargar lo arregla
    const versionNueva = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(this.state.error?.message));
    return (
      <div className="flex items-center justify-center p-4" style={{ minHeight: '60dvh' }}>
        <div className="card p-6 text-center" style={{ maxWidth: 420, width: '100%' }}>
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={24} style={{ color: '#D97706' }} />
          </div>
          <h2 className="text-lg font-bold text-primary mb-1">
            {versionNueva ? t('Hay una versión nueva de la app') : t('Algo salió mal en esta pantalla')}
          </h2>
          <p className="text-sm text-secondary mb-5">
            {versionNueva
              ? t('Recarga para usarla.')
              : t('Ya se avisó al administrador. Puedes intentar de nuevo o ir al inicio.')}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button type="button" className="btn btn-primary" onClick={() => (versionNueva ? window.location.reload() : this.setState({ error: null }))}>
              <RotateCcw size={15} /> {versionNueva ? t('Recargar') : t('Intentar de nuevo')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => { window.location.href = '/'; }}>
              <Home size={15} /> {t('Ir al inicio')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
