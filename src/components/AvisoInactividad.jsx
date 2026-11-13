import React, { useEffect, useRef, useState } from 'react';
import { Hourglass, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModalOverlay from './ModalOverlay';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { t } from '../i18n';
import { ultimaActividad, anotarActividad, faseInactividad, SEGUNDOS_AVISO } from '../utils/inactividad';

// Cierre de sesión por inactividad (como el "¿Sigues viendo?" de las apps de video): a los 14 min sin tocar
// la app sale este aviso con 60 s; "Sí, aquí sigo" renueva el token; sin respuesta se cierra la sesión.
// No cierra sin internet ni con cambios por subir (sin conexión no podrían volver a entrar).
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'];
const ESCRIBIR_CADA_MS = 5000; // la actividad se guarda como mucho cada 5 s

const AvisoInactividad = () => {
  const { cerrarPorInactividad, renovarSesion, logout } = useAuth();
  const { isOnline, pendingCount } = useData();
  const navigate = useNavigate();
  const [segundos, setSegundos] = useState(null); // null = sin aviso
  const avisoRef = useRef(false);
  const escritoRef = useRef(0);
  // Sin internet o con cambios por subir no se cierra: el reloj vuelve a empezar al reconectarse
  const enPausaRef = useRef(false);
  const cerrarRef = useRef(null);
  useEffect(() => {
    enPausaRef.current = !isOnline || pendingCount > 0;
    cerrarRef.current = () => { cerrarPorInactividad(); navigate('/login', { replace: true }); };
  });

  useEffect(() => {
    if (!ultimaActividad()) anotarActividad();

    const cerrar = () => {
      avisoRef.current = false;
      cerrarRef.current?.();
    };

    const revisar = () => {
      if (enPausaRef.current) {
        anotarActividad();
        if (avisoRef.current) { avisoRef.current = false; setSegundos(null); }
        return;
      }
      const f = faseInactividad(ultimaActividad());
      if (f.fase === 'cerrar') return cerrar();
      if (f.fase === 'aviso') { avisoRef.current = true; setSegundos(f.segundos); return; }
      // Otra pestaña contestó "Sí, aquí sigo" (o hubo actividad allá)
      if (avisoRef.current) { avisoRef.current = false; setSegundos(null); }
    };

    const actividad = () => {
      if (avisoRef.current) return; // con el aviso abierto hay que contestarlo
      const ahora = Date.now();
      if (ahora - escritoRef.current < ESCRIBIR_CADA_MS) return;
      // Volvió después del límite (teléfono bloqueado, app en segundo plano): primero se revisa
      if (!enPausaRef.current && faseInactividad(ultimaActividad(), ahora).fase !== 'activo') return revisar();
      escritoRef.current = ahora;
      anotarActividad(ahora);
    };

    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };

    EVENTOS.forEach((e) => window.addEventListener(e, actividad, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', revisar);
    const reloj = setInterval(revisar, 1000);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, actividad, { capture: true }));
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', revisar);
      clearInterval(reloj);
    };
  }, []);

  if (segundos === null) return null;

  const sigo = () => {
    avisoRef.current = false;
    escritoRef.current = Date.now();
    anotarActividad();
    setSegundos(null);
    renovarSesion();
  };
  const salir = () => {
    avisoRef.current = false;
    logout();
    navigate('/login', { replace: true });
  };

  const avance = segundos / SEGUNDOS_AVISO;
  const R = 34, C = 2 * Math.PI * R;

  return (
    <ModalOverlay size="small">
      <div className="text-center" data-aviso-inactividad role="alertdialog" aria-live="assertive">
        <div className="relative mx-auto mb-4" style={{ width: 88, height: 88 }}>
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
            <circle cx="44" cy="44" r={R} fill="none" stroke="#E5E7EB" strokeWidth="7" />
            <circle cx="44" cy="44" r={R} fill="none" stroke={segundos <= 10 ? '#DC2626' : '#2563EB'} strokeWidth="7"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - avance)}
              transform="rotate(-90 44 44)" style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold"
            style={{ color: segundos <= 10 ? '#DC2626' : '#1F2937' }} data-segundos>{segundos}</span>
        </div>
        <h2 className="text-xl font-bold mb-2 flex items-center justify-center gap-2" style={{ color: '#111827' }}>
          <Hourglass size={20} /> {t('¿Sigues ahí?')}
        </h2>
        <p className="text-sm mb-5" style={{ color: '#4B5563' }}>
          {t('Por seguridad, tu sesión se cerrará en {n} segundos si no contestas.', { n: segundos })}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={sigo} data-sigo-aqui autoFocus>
            {t('Sí, aquí sigo')}
          </button>
          <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={salir}>
            <LogOut size={16} /> {t('Cerrar Sesión')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};

export default AvisoInactividad;
