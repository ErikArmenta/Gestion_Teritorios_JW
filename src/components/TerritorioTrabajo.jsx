import { useState } from 'react';
import { CheckCircle2, UsersRound, XCircle } from 'lucide-react';
import { useGrupos } from '../context/GruposContext';
import { useToast } from './Toast';
import { PROGRESO } from '../utils/territoryProgress';
import { t } from '../i18n';

// Sección "Progreso / Grupo" dentro del popup de un territorio en el mapa.
// Popups de Leaflet usan fondo oscuro → colores fijos claros.
const TerritorioTrabajo = ({ territorio, progreso }) => {
  const { disponible, grupos, puedeGestionar, puedeTerminar, asignarTerritorioAGrupo, terminarTrabajo, cancelarTrabajo } = useGrupos();
  const toast = useToast();
  const [grupoSel, setGrupoSel] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!progreso) return null;
  const cfg = PROGRESO[progreso.estado];
  const trabajoActivo = progreso.estado === 'en_progreso' ? progreso.trabajo : null;
  // Solo grupos de la congregación del territorio (no se mezclan congregaciones)
  const gruposDelTerritorio = grupos.filter(g =>
    g.activo !== false && String(g.congregacion_id) === String(territorio.congregacion_id));

  const accion = async (fn, ok) => {
    setEnviando(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err.message?.includes('uniq_trabajo_activo')
        ? t('Este territorio ya lo está trabajando otro grupo')
        : `${t('Error')}: ${err.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const btn = 'flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg disabled:opacity-50';

  return (
    <div className="mb-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${cfg.color}26`, color: cfg.color }}>
          {t(cfg.label)}
        </span>
        <span className="text-xs font-bold" style={{ color: '#F1F5F9' }}>{progreso.pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full" style={{ width: `${progreso.pct}%`, background: cfg.color }} />
      </div>
      <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: '#94A3B8' }}>
        {progreso.grupo && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: progreso.grupo.color }} />}
        <span>{t('{v}/{t} casas', { v: progreso.visitadas, t: progreso.total })} · {progreso.detalle}</span>
      </p>

      {/* Acciones de grupo */}
      {disponible && trabajoActivo && (puedeTerminar(trabajoActivo) || puedeGestionar) && (
        <div className="flex gap-1.5 mt-2">
          {puedeTerminar(trabajoActivo) && (
            <button
              type="button"
              disabled={enviando}
              className={btn}
              style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399', border: '1px solid rgba(16,185,129,0.35)' }}
              onClick={() => accion(() => terminarTrabajo(trabajoActivo.id), t('Territorio marcado como terminado'))}
            >
              <CheckCircle2 size={12} /> {t('Terminado')}
            </button>
          )}
          {puedeGestionar && (
            <button
              type="button"
              disabled={enviando}
              className={btn}
              style={{ background: 'rgba(148,163,184,0.12)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.25)' }}
              onClick={() => accion(() => cancelarTrabajo(trabajoActivo.id), t('Asignación al grupo cancelada'))}
              title={t('Quitar al grupo sin marcarlo como terminado')}
            >
              <XCircle size={12} /> {t('Quitar')}
            </button>
          )}
        </div>
      )}

      {disponible && !trabajoActivo && puedeGestionar && (
        gruposDelTerritorio.length ? (
          <div className="flex gap-1.5 mt-2">
            <select
              value={grupoSel}
              onChange={e => setGrupoSel(e.target.value)}
              className="flex-1 min-w-0 rounded-lg px-2 py-1 text-[11px]"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F1F5F9', minHeight: 0 }}
            >
              <option value="">{t('Asignar a grupo…')}</option>
              {gruposDelTerritorio.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
            <button
              type="button"
              disabled={!grupoSel || enviando}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg disabled:opacity-40"
              style={{ background: '#2563EB', color: '#fff' }}
              onClick={() => accion(async () => { await asignarTerritorioAGrupo(territorio, Number(grupoSel)); setGrupoSel(''); }, t('Territorio asignado al grupo'))}
            >
              <UsersRound size={12} /> {t('Asignar')}
            </button>
          </div>
        ) : (
          <p className="text-[11px] mt-2" style={{ color: '#64748B' }}>{t('Crea grupos en el menú "Grupos" para asignarles territorios.')}</p>
        )
      )}
    </div>
  );
};

export default TerritorioTrabajo;
