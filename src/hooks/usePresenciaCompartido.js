import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { t } from '../i18n';

// "Ahí estamos todos": ubicación en vivo del grupo en un link compartido (/shared/:id).
// Supabase Realtime en modo PRESENCIA, canal `compartido:<id>` — no se guarda nada en tablas: cuando
// alguien cierra el link (o deja de compartir) desaparece del mapa.
//  - Todos los que abren el link ven a los demás; solo aparece quien toca "Compartir mi ubicación".
//  - Se manda como máximo una posición cada ENVIO_MS (la última que dio el GPS); quieto, una por minuto.
//  - Mientras comparte se pide mantener la pantalla encendida (Wake Lock): con la pantalla bloqueada
//    el navegador deja de dar la ubicación.
// Cada dispositivo tiene una llave fija (localStorage) → mismo color y sin duplicados al recargar.
const LLAVE_DISPOSITIVO = 'compartido_dispositivo';
const ENVIO_MS = 8000;
export const VIGENCIA_MS = 3 * 60 * 1000; // sin noticias en 3 min → se ve apagado
const COLORES = ['#22D3EE', '#F472B6', '#A3E635', '#FACC15', '#A78BFA', '#FB923C', '#34D399', '#F87171'];

const llaveDispositivo = () => {
  try {
    let k = localStorage.getItem(LLAVE_DISPOSITIVO);
    if (!k) {
      k = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(LLAVE_DISPOSITIVO, k);
    }
    return k;
  } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

export const colorDe = (llave) => {
  let h = 0;
  for (const ch of String(llave)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
};

// Solo en desarrollo, las pruebas pueden poner un canal falso (window.__canalPresenciaFalso)
const crearCanal = (nombre, llave) => {
  const falso = import.meta.env.DEV && window.__canalPresenciaFalso;
  if (falso) return { canal: falso(nombre, llave), real: false };
  return { canal: supabase.channel(nombre, { config: { presence: { key: llave } } }), real: true };
};

export default function usePresenciaCompartido(compartidoId, nombre) {
  const [llave] = useState(llaveDispositivo);
  const [otros, setOtros] = useState([]); // [{ llave, nombre, color, lat, lng, t }]
  const [compartiendo, setCompartiendo] = useState(false);
  const [miPos, setMiPos] = useState(null);
  const [error, setError] = useState('');
  const [conectado, setConectado] = useState(false);

  const canalRef = useRef(null);
  const conectadoRef = useRef(false);
  const ultimaRef = useRef(null);   // última posición del GPS (aún sin mandar)
  const enviadaRef = useRef(null);  // última que se mandó
  const watchRef = useRef(null);
  const intervaloRef = useRef(null);
  const wakeRef = useRef(null);
  const nombreRef = useRef(nombre);
  useEffect(() => { nombreRef.current = nombre; });

  // ── Canal (todos ven a los demás, aunque no compartan) ──
  useEffect(() => {
    if (!compartidoId) return undefined;
    const { canal, real } = crearCanal(`compartido:${compartidoId}`, llave);
    canalRef.current = canal;
    const leer = () => {
      const estado = canal.presenceState() || {};
      setOtros(Object.entries(estado).flatMap(([k, metas]) => {
        if (k === llave) return [];
        const m = (metas || [])[metas.length - 1];
        const lat = Number(m?.lat); const lng = Number(m?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        return [{ llave: k, nombre: String(m.nombre || '').slice(0, 40) || t('Publicador'), color: colorDe(k), lat, lng, t: Number(m.t) || Date.now() }];
      }));
    };
    canal.on('presence', { event: 'sync' }, leer);
    canal.subscribe((status) => {
      conectadoRef.current = status === 'SUBSCRIBED';
      setConectado(conectadoRef.current);
      // Si ya estaba compartiendo (reconexión), volver a aparecer
      if (conectadoRef.current && enviadaRef.current) canal.track(enviadaRef.current);
    });
    return () => {
      conectadoRef.current = false;
      if (real) supabase.removeChannel(canal); else canal.unsubscribe?.();
      canalRef.current = null;
    };
  }, [compartidoId, llave]);

  const mandar = useCallback(() => {
    const p = ultimaRef.current;
    if (!p) return;
    // Sin moverse: se repite cada minuto para que los demás no lo vean "apagado"
    if (p === enviadaRef.current && Date.now() - enviadaRef.current.t < 60000) return;
    const datos = { nombre: nombreRef.current || t('Publicador'), lat: p.lat, lng: p.lng, t: Date.now() };
    enviadaRef.current = datos;
    ultimaRef.current = datos;
    if (conectadoRef.current) canalRef.current?.track(datos);
  }, []);

  const pedirPantallaEncendida = useCallback(async () => {
    try { wakeRef.current = await navigator.wakeLock?.request('screen'); } catch { /* no soportado o negado */ }
  }, []);

  const dejarDeCompartir = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    clearInterval(intervaloRef.current);
    intervaloRef.current = null;
    try { wakeRef.current?.release(); } catch { /* ya liberado */ }
    wakeRef.current = null;
    ultimaRef.current = null;
    enviadaRef.current = null;
    if (conectadoRef.current) canalRef.current?.untrack();
    setMiPos(null);
    setCompartiendo(false);
  }, []);

  const empezarACompartir = useCallback(() => {
    if (!navigator.geolocation) { setError(t('Tu navegador no da la ubicación.')); return; }
    setError('');
    let primera = true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) };
        ultimaRef.current = p;
        setMiPos(p);
        if (primera) { primera = false; mandar(); }
      },
      () => {
        setError(t('No pudimos obtener tu ubicación. Revisa el permiso de ubicación del navegador.'));
        dejarDeCompartir();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    intervaloRef.current = setInterval(mandar, ENVIO_MS);
    pedirPantallaEncendida();
    setCompartiendo(true);
  }, [mandar, dejarDeCompartir, pedirPantallaEncendida]);

  // El Wake Lock se suelta al cambiar de app: pedirlo otra vez al volver
  useEffect(() => {
    if (!compartiendo) return undefined;
    const alVolver = () => { if (document.visibilityState === 'visible') pedirPantallaEncendida(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [compartiendo, pedirPantallaEncendida]);

  // Al salir de la página
  useEffect(() => () => dejarDeCompartir(), [dejarDeCompartir]);

  return { llave, otros, compartiendo, miPos, error, conectado, empezarACompartir, dejarDeCompartir };
}
