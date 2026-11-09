import React, { useState } from 'react';
import { BellRing, Eye, Loader2 } from 'lucide-react';
import { tokenVigente } from '../utils/sesion';
import { t } from '../i18n';

// Backup → Recordatorios automáticos (Edge Function `recordatorios`, Migración 16). Solo Super Admin.
// Explica qué se manda y deja ver a quién le llegaría hoy, sin mandar nada.
const URL_FUNCION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recordatorios`;
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY;

const RecordatoriosAutomaticos = () => {
  const [estado, setEstado] = useState(null); // null | 'cargando' | { ... } | { error }

  const verVistaPrevia = async () => {
    setEstado('cargando');
    try {
      const res = await fetch(URL_FUNCION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
        body: JSON.stringify({ accion: 'vista_previa', token: tokenVigente() }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        const codigo = res.status === 404 ? 'no_configurado' : (cuerpo?.error || 'servidor');
        setEstado({ error: codigo });
        return;
      }
      setEstado(cuerpo);
    } catch {
      setEstado({ error: 'red' });
    }
  };

  const errorTexto = {
    no_configurado: t('Aún no está configurado en el servidor (función "recordatorios"; pasos en docs/RECORDATORIOS.md).'),
    falta_migracion_16: t('Falta correr la Migración 16 en Supabase.'),
    sin_permiso: t('Solo el Super Admin puede ver esto.'),
  };

  return (
    <div className="card mb-6 p-6" style={{ border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-3 mb-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(124,58,237,0.12)' }}>
          <BellRing size={20} style={{ color: '#7C3AED' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-primary m-0">{t('Recordatorios automáticos')}</h2>
          <p className="text-xs text-secondary m-0">{t('Todos los días a las 7 p. m. se revisa qué toca avisar. Nunca se repite un aviso.')}</p>
        </div>
      </div>
      <ul className="text-sm text-secondary m-0 mb-3 pl-5 flex flex-col gap-1">
        <li>{t('Informe: el último día del mes y los días 1 y 2, a quien no lo ha enviado.')}</li>
        <li>{t('Exhibidor: un día antes del turno, a quien le toca.')}</li>
        <li>{t('Territorios: los lunes, a ancianos y admins, los que llevan más de 4 meses sin trabajarse.')}</li>
        <li>{t('Aseo del Salón: un día antes de cada reunión (7 p. m.) y el mismo día (8 a. m.), al grupo que le toca (se planea en Grupos).')}</li>
      </ul>
      <button type="button" className="btn btn-outline text-sm" onClick={verVistaPrevia} disabled={estado === 'cargando'}>
        {estado === 'cargando' ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} {t('Ver quién los recibiría hoy')}
      </button>
      {estado && estado !== 'cargando' && (estado.error ? (
        <p className="text-sm mt-3" style={{ color: '#B45309' }}>{errorTexto[estado.error] || t('No se pudo consultar.')}</p>
      ) : (
        <div className="mt-3 text-sm text-secondary">
          <p className="m-0 mb-1"><strong className="text-primary">{t('Por mandar hoy:')} {estado.porEnviar}</strong> · {t('ya enviados:')} {estado.yaEnviados} · {estado.hoy}</p>
          <p className="m-0 mb-2 text-xs">
            {t('Informe')}: {estado.informe?.avisos || 0} · {t('Exhibidor')}: {estado.turnos || 0} · {t('Territorios')}: {estado.territorios?.avisos || 0} · {t('Aseo')}: {estado.aseo?.avisos || 0}
          </p>
          {estado.muestra?.length > 0 && (
            <ul className="m-0 p-0 flex flex-col gap-1" style={{ listStyle: 'none' }}>
              {estado.muestra.map((m, i) => (
                <li key={i} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--bg-hover)' }}>
                  <strong className="text-primary">{m.titulo}</strong> — {m.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
};

export default RecordatoriosAutomaticos;
