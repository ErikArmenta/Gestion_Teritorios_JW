import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Loader2, RefreshCw, CloudUpload } from 'lucide-react';
import { useToast } from './Toast';
import { tokenVigente } from '../utils/sesion';
import { t } from '../i18n';

// Backup → Respaldos automáticos (Migración 14 + Edge Function `respaldo`). Solo Super Admin.
const URL_FUNCION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respaldo`;
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function llamar(accion, datos = {}) {
  let res;
  try {
    res = await fetch(URL_FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
      body: JSON.stringify({ accion, token: tokenVigente(), ...datos }),
    });
  } catch {
    throw new Error('red');
  }
  const cuerpo = await res.json().catch(() => null);
  if (res.ok && cuerpo) return cuerpo;
  throw new Error(res.status === 404 ? 'no_configurado' : (cuerpo?.error || 'servidor'));
}

const tamano = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fecha = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const RespaldosAutomaticos = () => {
  const toast = useToast();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | no_configurado | error
  const [lista, setLista] = useState([]);
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await llamar('listar');
      setLista(r.respaldos || []);
      setEstado('listo');
    } catch (err) {
      setEstado(err.message === 'no_configurado' ? 'no_configurado' : 'error');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const respaldarAhora = async () => {
    setOcupado('crear');
    try {
      const r = await llamar('crear');
      toast.success(t('Respaldo guardado ({n})', { n: tamano(r.tamano) }));
      await cargar();
    } catch (err) {
      toast.error(t('No se pudo respaldar: ') + err.message);
    } finally {
      setOcupado(null);
    }
  };

  const descargar = async (nombre) => {
    setOcupado(nombre);
    try {
      const { url } = await llamar('descargar', { nombre });
      window.location.assign(url);
    } catch (err) {
      toast.error(t('No se pudo descargar: ') + err.message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="card mb-6 p-6" style={{ border: '1px solid var(--border-color)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(5,150,105,0.12)' }}>
            <Archive size={20} style={{ color: '#059669' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-primary m-0">{t('Respaldos automáticos')}</h2>
            <p className="text-xs text-secondary m-0">{t('Cada domingo se guarda una copia de todo. Se conservan los últimos 12.')}</p>
          </div>
        </div>
        {estado === 'listo' && (
          <button type="button" className="btn btn-outline text-sm" onClick={respaldarAhora} disabled={!!ocupado}>
            {ocupado === 'crear' ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />} {t('Respaldar ahora')}
          </button>
        )}
      </div>

      {estado === 'cargando' && <p className="text-sm text-secondary flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {t('Cargando...')}</p>}
      {estado === 'no_configurado' && (
        <p className="text-sm text-secondary">{t('Aún no están configurados en el servidor (Migración 14 y función "respaldo"; pasos en docs/RESPALDOS.md).')}</p>
      )}
      {estado === 'error' && (
        <p className="text-sm text-secondary flex items-center gap-2">
          {t('No se pudo consultar la lista.')}
          <button type="button" className="btn btn-outline text-xs py-1 px-2" onClick={cargar}><RefreshCw size={13} /> {t('Reintentar')}</button>
        </p>
      )}
      {estado === 'listo' && (lista.length === 0 ? (
        <p className="text-sm text-secondary">{t('Todavía no hay respaldos. El primero se hará el domingo, o usa "Respaldar ahora".')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 m-0 p-0" style={{ listStyle: 'none' }}>
          {lista.map((r) => (
            <li key={r.nombre} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--bg-hover)' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary m-0 truncate">{fecha(r.fecha)}</p>
                <p className="text-xs text-muted m-0">{tamano(r.tamano)}</p>
              </div>
              <button type="button" className="btn btn-outline text-xs py-1.5 px-2.5 shrink-0" onClick={() => descargar(r.nombre)} disabled={!!ocupado}>
                {ocupado === r.nombre ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {t('Descargar')}
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
};

export default RespaldosAutomaticos;
