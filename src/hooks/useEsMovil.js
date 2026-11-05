import { useEffect, useState } from 'react';

// true si la pantalla es < md (768px): celular (BottomNav, paneles abajo).
const MQ_MOVIL = '(max-width: 767px)';

export default function useEsMovil() {
  const [esMovil, setEsMovil] = useState(() => !!window.matchMedia?.(MQ_MOVIL).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MQ_MOVIL);
    if (!mq?.addEventListener) return undefined;
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return esMovil;
}
