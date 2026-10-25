import { UsersRound, Crown } from 'lucide-react';
import { PROGRESO, formatFechaCorta } from '../utils/territoryProgress';
import { t } from '../i18n';

// Dashboard: progreso de territorios y avance de cada grupo de predicación.
// resumen: resultado de resumenPorGrupo(); conteo: resultado de conteoPorEstado()
const GruposDashboardCard = ({ disponible, resumen, conteo, miembros = [] }) => {
  const anio = new Date().getFullYear();
  const totalTerr = conteo.completado + conteo.en_progreso + conteo.sin_trabajar;

  return (
    <div className="card mb-5" style={{ borderLeft: '3px solid #10B981' }}>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#10B981' }} />
        <h3 className="text-sm font-bold text-primary">{t('Progreso por grupo de predicación')}</h3>
      </div>

      {/* Estado de los territorios */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[
          ['completado', conteo.completado],
          ['en_progreso', conteo.en_progreso],
          ['sin_trabajar', conteo.sin_trabajar],
        ].map(([estado, n]) => (
          <div key={estado} className="rounded-xl p-3 text-center" style={{ background: `${PROGRESO[estado].color}14`, border: `1px solid ${PROGRESO[estado].color}33` }}>
            <p className="text-2xl font-extrabold leading-none num-display" style={{ color: estado === 'sin_trabajar' ? 'var(--text-secondary)' : PROGRESO[estado].color }}>{n}</p>
            <p className="text-[11px] font-semibold text-secondary mt-1.5">{t(PROGRESO[estado].label)}</p>
            <p className="text-[10px] text-muted">{totalTerr ? Math.round((n / totalTerr) * 100) : 0}%</p>
          </div>
        ))}
      </div>

      {disponible === false ? (
        <p className="text-sm text-muted">{t('Activa los grupos de predicación (Migración 5) para ver el avance por grupo.')}</p>
      ) : resumen.length === 0 ? (
        <p className="text-sm text-muted">{t('Aún no hay grupos. Créalos en el menú "Grupos".')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {resumen.map(({ grupo, publicadores, enProgreso, avance, terminadosAnio, ultimoTerminado }) => {
            const encargado = miembros.find(m => String(m.id) === String(grupo.encargado_id));
            return (
              <div key={grupo.id} className="rounded-xl p-3.5" style={{ background: 'var(--bg-hover)', borderLeft: `4px solid ${grupo.color}` }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-primary truncate">{grupo.nombre}</p>
                    <p className="text-[11px] text-muted flex items-center gap-1 truncate">
                      <Crown size={11} style={{ color: '#F59E0B' }} className="shrink-0" />
                      {encargado?.nombre || t('Sin encargado')}
                      <span className="mx-1">·</span>
                      <UsersRound size={11} className="shrink-0" /> {publicadores}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold leading-none num-display" style={{ color: '#10B981' }}>{terminadosAnio}</p>
                    <p className="text-[10px] text-muted">{t('Terminados {anio}', { anio })}</p>
                  </div>
                </div>

                {enProgreso.length ? (
                  <>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold" style={{ color: '#F59E0B' }}>
                        {t('{n} en progreso', { n: enProgreso.length })}
                      </span>
                      <span className="font-bold text-primary">{avance}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                      <div className="h-full rounded-full" style={{ width: `${avance}%`, background: '#F59E0B', transition: 'width .4s ease' }} />
                    </div>
                    <p className="text-[11px] text-muted mt-1.5 truncate">
                      {enProgreso.map(x => x.numero || x.nombre).join(' · ')}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted">
                    {t('Sin territorio asignado')}
                    {ultimoTerminado && ` · ${t('último terminado {fecha}', { fecha: formatFechaCorta(ultimoTerminado) })}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GruposDashboardCard;
