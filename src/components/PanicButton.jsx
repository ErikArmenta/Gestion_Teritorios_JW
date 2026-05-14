import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const HOLD_DURATION_MS = 2000;
const INTERVAL_MS = 20;
const STEPS = HOLD_DURATION_MS / INTERVAL_MS; // 100

const TIPOS = [
  { value: 'seguridad', label: 'Seguridad', color: '#EF4444' },
  { value: 'medica',    label: 'Medica',    color: '#3B82F6' },
  { value: 'accidente', label: 'Accidente', color: '#F97316' },
];

export default function PanicButton() {
  const { user } = useAuth();

  const [holding, setHolding]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [alertActive, setAlertActive] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [alertId, setAlertId]       = useState(null);
  const [tipo, setTipo]             = useState('seguridad');
  const [mensaje, setMensaje]       = useState('');
  const [saving, setSaving]         = useState(false);

  const intervalRef = useRef(null);
  const progressRef = useRef(0);

  // Clean up interval on unmount
  useEffect(() => () => clearInterval(intervalRef.current), []);

  const resetHold = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    progressRef.current = 0;
    setProgress(0);
    setHolding(false);
  }, []);

  const activateAlert = useCallback(async () => {
    resetHold();

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    let lat = null;
    let lng = null;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // GPS not available — insert without coordinates
    }

    const { data, error } = await supabase
      .from('alertas_panico')
      .insert({
        usuario_id: user.id,
        latitud: lat,
        longitud: lng,
        tipo: 'seguridad',
        activa: true,
      })
      .select('id')
      .single();

    if (!error && data) {
      setAlertId(data.id);
    }

    setAlertActive(true);
    setShowModal(true);
  }, [user, resetHold]);

  const startHold = useCallback((e) => {
    e.preventDefault();
    if (alertActive) {
      // If alert already active, just open modal
      setShowModal(true);
      return;
    }
    if (intervalRef.current) return;

    setHolding(true);
    progressRef.current = 0;
    setProgress(0);

    intervalRef.current = setInterval(() => {
      progressRef.current += 1;
      setProgress(progressRef.current);

      if (progressRef.current >= STEPS) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        activateAlert();
      }
    }, INTERVAL_MS);
  }, [alertActive, activateAlert]);

  const stopHold = useCallback(() => {
    if (!alertActive) {
      resetHold();
    }
  }, [alertActive, resetHold]);

  const handleCancelAlert = async () => {
    if (!alertId) { setShowModal(false); setAlertActive(false); return; }
    setSaving(true);
    await supabase
      .from('alertas_panico')
      .update({ activa: false, cerrada_at: new Date().toISOString() })
      .eq('id', alertId);
    setSaving(false);
    setAlertActive(false);
    setShowModal(false);
    setAlertId(null);
    setTipo('seguridad');
    setMensaje('');
  };

  const handleUpdateMeta = async () => {
    if (!alertId) return;
    setSaving(true);
    await supabase
      .from('alertas_panico')
      .update({ tipo, mensaje })
      .eq('id', alertId);
    setSaving(false);
  };

  // SVG ring progress
  const SIZE = 72;
  const STROKE = 4;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress / STEPS);

  const buttonStyle = alertActive
    ? { animation: 'panic-pulse 1s ease-in-out infinite' }
    : holding
    ? {}
    : { animation: 'panic-pulse 3s ease-in-out infinite' };

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-[9999] select-none" style={{ width: SIZE, height: SIZE }}>
        {/* Progress ring — visible while holding */}
        {holding && (
          <svg
            width={SIZE}
            height={SIZE}
            className="absolute inset-0 -rotate-90"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(239,68,68,0.2)"
              strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="#EF4444"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 20ms linear' }}
            />
          </svg>
        )}

        {/* Button */}
        <button
          onMouseDown={startHold}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={startHold}
          onTouchEnd={stopHold}
          onTouchCancel={stopHold}
          className="absolute flex items-center justify-center rounded-full shadow-2xl cursor-pointer focus:outline-none"
          style={{
            width: 56,
            height: 56,
            top: (SIZE - 56) / 2,
            left: (SIZE - 56) / 2,
            backgroundColor: holding
              ? `hsl(${0 + progress * 0}, 90%, ${45 - progress * 0.05}%)`
              : '#DC2626',
            ...buttonStyle,
          }}
          title={alertActive ? 'Alerta activa — tocar para gestionar' : 'Mantén presionado 2s para activar alerta'}
          aria-label="Botón de pánico"
        >
          {alertActive ? (
            // Siren icon when active
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="white">
              <path d="M12 2a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm6.364 2.636a1 1 0 0 1 0 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM5.636 4.636a1 1 0 0 1 1.414 0l.707.707A1 1 0 0 1 6.343 6.757l-.707-.707a1 1 0 0 1 0-1.414zM4 11a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2H5a1 1 0 0 1-1-1zm14 0a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2h-1a1 1 0 0 1-1-1zm-6-4a5 5 0 0 1 5 5v2H7v-2a5 5 0 0 1 5-5zM3 17h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2z"/>
            </svg>
          ) : (
            // Bell/alert icon when idle
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86A2 2 0 0 1 12 3a2 2 0 0 1 1.71.86"/>
              <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2z"/>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z"/>
              <line x1="12" y1="2" x2="12" y2="3"/>
            </svg>
          )}
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[99998] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-5"
               style={{ backgroundColor: '#0F172A', border: '1px solid rgba(239,68,68,0.3)' }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse inline-block" />
                <h2 className="text-white font-bold text-lg tracking-wide">ALERTA ACTIVA</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {/* Tipo selector */}
            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2">Tipo de emergencia</label>
              <div className="flex gap-2">
                {TIPOS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: tipo === t.value ? t.color : 'rgba(255,255,255,0.07)',
                      color: tipo === t.value ? '#fff' : '#94A3B8',
                      border: `1px solid ${tipo === t.value ? t.color : 'transparent'}`,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensaje */}
            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2">Mensaje (opcional)</label>
              <textarea
                rows={3}
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                placeholder="Describe brevemente la situación..."
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            {/* Update button */}
            <button
              onClick={handleUpdateMeta}
              disabled={saving}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#1E40AF' }}
            >
              {saving ? 'Guardando...' : 'Actualizar tipo y mensaje'}
            </button>

            {/* Divider */}
            <div className="border-t border-slate-700" />

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCancelAlert}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-bold text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                CANCELAR ALERTA
              </button>
              <a
                href="tel:911"
                className="flex-1 py-3 rounded-xl font-bold text-sm text-center text-white"
                style={{ backgroundColor: '#DC2626' }}
              >
                Llamar 911
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
