import React, { useCallback, useEffect, useState } from 'react';
import { Bug, Check, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useToast } from './Toast';
import { t } from '../i18n';

// Backup → Errores de la app (Migración 14, tabla errores_app). Solo Super Admin (la BD solo se los deja ver a él).
// Todo el texto viene de los teléfonos: se pinta como texto (React lo escapa), nunca como HTML.
const hace = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return t('hace {n} min', { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t('hace {n} h', { n: Math.round(s / 3600) });
  return t('hace {n} días', { n: Math.round(s / 86400) });
};

const ErroresApp = () => {
  const toast = useToast();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | sin_migracion
  const [errores, setErrores] = useState([]);
  const [verResueltos, setVerResueltos] = useState(false);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    let q = supabase.from('errores_app')
      .select('id, mensaje, pila, ruta, navegador, version, veces, primera_vez, ultima_vez, resuelto, app_usuarios(nombre)')
      .order('ultima_vez', { ascending: false }).limit(100);
    if (!verResueltos) q = q.eq('resuelto', false);
    const { data, error } = await q;
    if (error) { setEstado('sin_migracion'); return; }
    setErrores(data || []);
    setEstado('listo');
  }, [verResueltos]);

  useEffect(() => { cargar(); }, [cargar]);

  const resolver = async (e) => {
    const { error } = await supabase.from('errores_app').update({ resuelto: true }).eq('id', e.id);
    if (error) { toast.error(t('Error: ') + error.message); return; }
    setErrores((lista) => (verResueltos ? lista.map((x) => (x.id === e.id ? { ...x, resuelto: true } : x)) : lista.filter((x) => x.id !== e.id)));
  };

  return (
    <div className="card mb-6 p-6" style={{ border: '1px solid var(--border-color)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <Bug size={20} style={{ color: '#DC2626' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-primary m-0">{t('Errores de la app')}</h2>
            <p className="text-xs text-secondary m-0">{t('Lo que les ha fallado a los hermanos en su teléfono. El mismo error se agrupa.')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-secondary flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} /> {t('Ver resueltos')}
          </label>
          <button type="button" className="btn btn-outline text-xs py-1.5 px-2.5" onClick={cargar} title={t('Actualizar')}><RefreshCw size={13} /></button>
        </div>
      </div>

      {estado === 'cargando' && <p className="text-sm text-secondary flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {t('Cargando...')}</p>}
      {estado === 'sin_migracion' && <p className="text-sm text-secondary">{t('Falta correr la Migración 14 en Supabase.')}</p>}
      {estado === 'listo' && errores.length === 0 && (
        <p className="text-sm flex items-center gap-2" style={{ color: '#059669' }}><Check size={16} /> {t('Sin errores pendientes')}</p>
      )}
      {estado === 'listo' && errores.length > 0 && (
        <ul className="flex flex-col gap-2 m-0 p-0" style={{ listStyle: 'none' }}>
          {errores.map((e) => (
            <li key={e.id} className="rounded-xl p-3" style={{ background: 'var(--bg-hover)', opacity: e.resuelto ? 0.6 : 1 }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary m-0 break-words">{e.mensaje}</p>
                  <p className="text-xs text-muted m-0 mt-0.5">
                    <strong style={{ color: '#DC2626' }}>{e.veces}×</strong> · {hace(e.ultima_vez)} · {e.ruta || '—'}
                    {e.app_usuarios?.nombre ? ` · ${e.app_usuarios.nombre}` : ''} · v {e.version || '—'}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" className="btn btn-outline text-xs py-1 px-2" onClick={() => setAbierto(abierto === e.id ? null : e.id)} title={t('Detalle')}>
                    {abierto === e.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {!e.resuelto && (
                    <button type="button" className="btn btn-outline text-xs py-1 px-2" onClick={() => resolver(e)} title={t('Marcar como resuelto')}>
                      <Check size={13} />
                    </button>
                  )}
                </div>
              </div>
              {abierto === e.id && (
                <div className="mt-2 text-xs text-secondary">
                  <p className="m-0 mb-1">{t('Primera vez')}: {new Date(e.primera_vez).toLocaleString()} · {e.navegador}</p>
                  <pre className="m-0 p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-card)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220 }}>{e.pila || '—'}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ErroresApp;
