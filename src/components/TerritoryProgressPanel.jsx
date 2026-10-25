import { useMemo, useState } from 'react';
import { TrendingUp, X } from 'lucide-react';
import { PROGRESO } from '../utils/territoryProgress';
// "t" se usa para territorios en las filas, por eso la función de traducción es tx
import { t as tx } from '../i18n';

const ORDEN = { en_progreso: 0, sin_trabajar: 1, completado: 2 };

const numeroCorto = (t) => {
  const n = String(t.numero ?? '').trim();
  return n && n.length <= 4 ? n : '';
};

const Chip = ({ label, n, color, activo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
    style={{
      background: activo ? color : `${color}1A`,
      color: activo ? '#fff' : color,
      border: `1px solid ${color}55`,
    }}
  >
    <span className="font-extrabold">{n}</span> {label}
  </button>
);

// Progreso de territorios: botón circular flotante dentro del mapa (abajo a la izquierda).
// Al tocarlo se despliega el panel sobre el mapa, sin modal: el mapa sigue usable y
// el panel se actualiza en tiempo real. Debe ir dentro de un contenedor position:relative.
// progreso: { [territorioId]: resultado de getTerritoryProgress }
const TerritoryProgressPanel = ({ territorios, progreso, onSelect }) => {
  const [filtro, setFiltro] = useState('todos');
  const [abierto, setAbierto] = useState(false);

  const filas = useMemo(() => territorios
    .map(t => ({ t, p: progreso[t.id] }))
    .filter(({ p }) => p)
    .sort((a, b) =>
      ORDEN[a.p.estado] - ORDEN[b.p.estado]
      || (a.p.estado === 'completado'
        // Completados: primero los terminados hace más tiempo (los próximos a trabajar de nuevo)
        ? String(a.p.fecha || '').localeCompare(String(b.p.fecha || ''))
        : b.p.pct - a.p.pct)
      || String(a.t.numero || a.t.nombre).localeCompare(String(b.t.numero || b.t.nombre), 'es', { numeric: true })
    ), [territorios, progreso]);

  const conteo = useMemo(() => {
    const c = { completado: 0, en_progreso: 0, sin_trabajar: 0 };
    filas.forEach(({ p }) => { c[p.estado] += 1; });
    return c;
  }, [filas]);

  const totalCasas = filas.reduce((s, { p }) => s + p.total, 0);
  const visitadas = filas.reduce((s, { p }) => s + p.visitadas, 0);
  const cobertura = totalCasas ? Math.round((visitadas / totalCasas) * 100) : 0;

  if (!filas.length) return null;

  const filtradas = filtro === 'todos' ? filas : filas.filter(({ p }) => p.estado === filtro);

  const toggleFiltro = (id) => setFiltro(f => (f === id ? 'todos' : id));

  return (
    <>
    <button
      type="button"
      className={`progress-fab${abierto ? ' is-open' : ''}`}
      onClick={() => setAbierto(v => !v)}
      title={tx('Progreso de territorios')}
      aria-label={tx('Progreso de territorios')}
      aria-expanded={abierto}
    >
      {abierto ? <X size={22} /> : <TrendingUp size={22} />}
      {!abierto && <span className="progress-fab__badge">{cobertura}%</span>}
    </button>

    {abierto && (
    <section className="progress-popover animate-scale-in">
      {/* Encabezado + resumen */}
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-primary m-0">{tx('Progreso de territorios')}</h2>
            <p className="text-xs text-secondary">
              {tx('Cobertura general')} <span className="font-bold text-primary">{cobertura}%</span> · {tx('{v}/{t} casas visitadas', { v: visitadas, t: totalCasas })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip label={tx('Completados')} n={conteo.completado} color={PROGRESO.completado.color} activo={filtro === 'completado'} onClick={() => toggleFiltro('completado')} />
          <Chip label={tx('En progreso')} n={conteo.en_progreso} color={PROGRESO.en_progreso.color} activo={filtro === 'en_progreso'} onClick={() => toggleFiltro('en_progreso')} />
          <Chip label={tx('Sin trabajar')} n={conteo.sin_trabajar} color="#64748B" activo={filtro === 'sin_trabajar'} onClick={() => toggleFiltro('sin_trabajar')} />
        </div>
      </div>

      {/* Lista */}
      <div className="progress-list flex flex-col gap-1">
        {filtradas.map(({ t, p }) => {
          const cfg = PROGRESO[p.estado];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect?.(t);
                // En pantallas chicas el panel tapa el mapa: se cierra para ver el territorio
                if (window.innerWidth < 640) setAbierto(false);
              }}
              className="progress-row grid items-center gap-x-3 gap-y-1 text-left rounded-xl px-2.5 py-2 transition-colors"
              title={tx('Ver en el mapa')}
            >
              {/* Territorio */}
              <span className="flex items-center gap-2 min-w-0" style={{ gridArea: 'nombre' }}>
                <span
                  className="shrink-0 min-w-[26px] h-[26px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white"
                  style={{ background: t.color || '#3B82F6' }}
                >
                  {numeroCorto(t) || String(t.nombre || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary truncate">{t.nombre || t.numero}</span>
                  <span className="block text-[11px] text-muted truncate">{p.detalle}</span>
                </span>
              </span>

              {/* Barra */}
              <span className="flex items-center gap-2" style={{ gridArea: 'barra' }}>
                <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(p.pct, p.pct ? 3 : 0)}%`, background: cfg.color, transition: 'width .4s ease' }} />
                </span>
                <span className="text-xs font-bold text-primary w-10 text-right">{p.pct}%</span>
              </span>

              {/* Estado */}
              <span className="flex items-center gap-2 justify-end" style={{ gridArea: 'estado' }}>
                <span className="text-[11px] text-muted whitespace-nowrap">{tx('{v}/{t} casas', { v: p.visitadas, t: p.total })}</span>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: `${cfg.color}1F`, color: p.estado === 'sin_trabajar' ? 'var(--text-secondary)' : cfg.color }}
                >
                  {tx(cfg.label)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

    </section>
    )}
    </>
  );
};

export default TerritoryProgressPanel;
