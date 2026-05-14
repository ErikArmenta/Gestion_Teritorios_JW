import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Bell, MapPin, Clock, User, Filter, X, ExternalLink } from 'lucide-react';

const TYPE_CONFIG = {
  seguridad:  { label: 'Seguridad',  bg: 'bg-red-600',    text: 'text-white' },
  medica:     { label: 'Médica',     bg: 'bg-blue-600',   text: 'text-white' },
  accidente:  { label: 'Accidente',  bg: 'bg-orange-500', text: 'text-white' },
};

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDuration = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (ms < 0) return null;
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
};

const TypeBadge = ({ tipo }) => {
  const cfg = TYPE_CONFIG[tipo] || { label: tipo, bg: 'bg-gray-600', text: 'text-white' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

const StatusBadge = ({ activa }) => {
  if (activa) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
        Activa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-600 text-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
      Cerrada
    </span>
  );
};

const AlertCard = ({ alerta }) => {
  const usuario = alerta.app_usuarios;
  const respondieron = Array.isArray(alerta.respondieron) ? alerta.respondieron : [];
  const duracion = formatDuration(alerta.created_at, alerta.cerrada_at);
  const mapsUrl = alerta.latitud && alerta.longitud
    ? `https://www.google.com/maps?q=${alerta.latitud},${alerta.longitud}`
    : null;

  const stripClass = TYPE_CONFIG[alerta.tipo]?.bg || 'bg-gray-600';

  return (
    <div
      className="card overflow-hidden p-0"
      style={{ borderLeft: alerta.activa ? '3px solid rgba(239,68,68,0.6)' : '3px solid rgba(100,116,139,0.25)' }}
    >
      {/* Header strip */}
      <div className={`h-1.5 w-full ${stripClass}`} />

      <div className="p-4 sm:p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <User size={15} style={{ color: '#64748B' }} />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: '#0F172A' }}>
                {usuario?.nombre || `Usuario #${alerta.usuario_id}`}
              </p>
              {usuario?.telefono && (
                <a href={`tel:${usuario.telefono}`} className="text-xs hover:underline" style={{ color: '#2563EB' }}>
                  {usuario.telefono}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge tipo={alerta.tipo} />
            <StatusBadge activa={alerta.activa} />
          </div>
        </div>

        {/* Mensaje */}
        {alerta.mensaje && (
          <p className="mt-3 text-sm rounded-xl px-3 py-2" style={{ color: '#475569', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}>
            {alerta.mensaje}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: '#475569' }}>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(alerta.created_at)}
          </span>
          {duracion && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Duración: {duracion}
            </span>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:underline"
              style={{ color: '#60A5FA' }}
            >
              <MapPin size={12} />
              Ver en mapa
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Respondedores */}
        {respondieron.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#475569' }}>
              Respondieron ({respondieron.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {respondieron.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(5,150,105,0.1)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}
                >
                  <User size={10} />
                  {r.nombre || `Usuario #${r.usuario_id}`}
                  {r.timestamp && (
                    <span className="ml-0.5" style={{ color: '#059669' }}>
                      · {new Date(r.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PanicHistory = () => {
  const { user } = useAuth();

  if (!user || user.rol !== 'Admin Principal') {
    return <Navigate to="/" replace />;
  }

  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState([]);

  // Filters
  const [filterFechaInicio, setFilterFechaInicio] = useState('');
  const [filterFechaFin, setFilterFechaFin] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  const fetchAlertas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('alertas_panico')
      .select('*, app_usuarios(nombre, telefono)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAlertas(data);
      // Build unique user list for filter select
      const uniqueUsers = [];
      const seen = new Set();
      data.forEach((a) => {
        if (a.usuario_id && !seen.has(a.usuario_id)) {
          seen.add(a.usuario_id);
          uniqueUsers.push({ id: a.usuario_id, nombre: a.app_usuarios?.nombre || `#${a.usuario_id}` });
        }
      });
      setUsuarios(uniqueUsers);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAlertas(); }, []);

  const clearFilters = () => {
    setFilterFechaInicio('');
    setFilterFechaFin('');
    setFilterUsuario('');
    setFilterTipo('');
    setFilterEstado('todos');
  };

  const filtered = alertas.filter((a) => {
    if (filterFechaInicio && new Date(a.created_at) < new Date(filterFechaInicio)) return false;
    if (filterFechaFin) {
      const end = new Date(filterFechaFin);
      end.setHours(23, 59, 59, 999);
      if (new Date(a.created_at) > end) return false;
    }
    if (filterUsuario && String(a.usuario_id) !== filterUsuario) return false;
    if (filterTipo && a.tipo !== filterTipo) return false;
    if (filterEstado === 'activa' && !a.activa) return false;
    if (filterEstado === 'cerrada' && a.activa) return false;
    return true;
  });

  const hasFilters = filterFechaInicio || filterFechaFin || filterUsuario || filterTipo || filterEstado !== 'todos';

  return (
    <div className="max-w-3xl mx-auto w-full animate-page-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <Bell size={20} style={{ color: '#F87171' }} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Historial de Alertas</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Registro completo de alertas de pánico</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: '#475569' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Filtros</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#475569' }}
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: '#475569' }}>Fecha inicio</label>
            <input
              type="date"
              value={filterFechaInicio}
              onChange={(e) => setFilterFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#475569' }}>Fecha fin</label>
            <input
              type="date"
              value={filterFechaFin}
              onChange={(e) => setFilterFechaFin(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#475569' }}>Usuario</label>
            <select
              value={filterUsuario}
              onChange={(e) => setFilterUsuario(e.target.value)}
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#475569' }}>Tipo</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="seguridad">Seguridad</option>
              <option value="medica">Médica</option>
              <option value="accidente">Accidente</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#475569' }}>Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="activa">Activas</option>
              <option value="cerrada">Cerradas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs mb-3 px-1" style={{ color: '#475569' }}>
        {loading ? 'Cargando...' : `${filtered.length} alerta${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
      </p>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <Bell size={40} className="mx-auto mb-3 opacity-20" style={{ color: '#64748B' }} />
          <p className="font-medium" style={{ color: '#475569' }}>No hay alertas{hasFilters ? ' con esos filtros' : ''}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((alerta) => (
            <AlertCard key={alerta.id} alerta={alerta} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PanicHistory;
