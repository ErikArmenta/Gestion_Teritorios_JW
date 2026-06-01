import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import ModalOverlay from '../components/ModalOverlay';
import { STATUS_OPTIONS, getStatusBadge, getStatusColor } from '../utils/constants';
import { Trash2, ChevronDown, ImageOff, ZoomIn, X, Search, Pencil, Upload, Mic } from 'lucide-react';
import Pagination from '../components/Pagination';
import { supabase } from '../supabaseClient';

const HousesList = () => {
  const { casas, territorios, deleteCasa, updateCasa, insertarHistorialVisita, loading } = useData();
  const { user } = useAuth();
  const toast = useToast();

  const [searchTerm, setSearchTerm]           = useState('');
  const [filterTerritory, setFilterTerritory] = useState('Todos');
  const [filterStatus, setFilterStatus]       = useState('Todos');
  const [deleteTarget, setDeleteTarget]       = useState(null);
  const [editStatusId, setEditStatusId]       = useState(null);
  const [lightboxUrl, setLightboxUrl]         = useState(null);
  const [visitaModal, setVisitaModal]         = useState(null); // {id, estadoActual, nuevoEstado}
  const [visitaNotas, setVisitaNotas]         = useState('');
  const [savingVisita, setSavingVisita]       = useState(false);
  const [editTarget, setEditTarget]           = useState(null); // null | casa
  const [currentPage, setCurrentPage]         = useState(1);
  const [audioModal, setAudioModal]           = useState(null); // null | { url, direccion }
  const [importModal, setImportModal]         = useState(false);
  const [importPreview, setImportPreview]     = useState([]); // all parsed rows
  const [importErrors, setImportErrors]       = useState(new Set()); // indices of invalid rows
  const [importing, setImporting]             = useState(false);
  const importFileRef                         = useRef(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightboxUrl]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
      </div>
    );
  }

  const filteredCasas = casas.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchSearch = c.direccion.toLowerCase().includes(q) ||
                        (c.nombre_contacto?.toLowerCase().includes(q)) ||
                        (c.territorio_nombre?.toLowerCase().includes(q));
    const matchTerritory = filterTerritory === 'Todos' || String(c.territorio_id) === String(filterTerritory);
    const matchStatus    = filterStatus    === 'Todos' || c.estado === filterStatus;
    return matchSearch && matchTerritory && matchStatus;
  });

  const paginatedCasas = filteredCasas.slice((currentPage - 1) * 25, currentPage * 25);

  const handleDelete = async () => {
    try {
      await deleteCasa(deleteTarget.id);
      toast.success('Casa eliminada correctamente');
    } catch {
      toast.error('Error al eliminar la casa. Verifica los permisos.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (id, nuevoEstado) => {
    try {
      await updateCasa(id, { estado: nuevoEstado });
      toast.success('Estado actualizado');
    } catch {
      toast.error('Error al actualizar el estado');
    } finally {
      setEditStatusId(null);
    }
  };

  const handleConfirmVisita = async () => {
    if (!visitaModal) return;
    setSavingVisita(true);
    try {
      await insertarHistorialVisita({
        casa_id: visitaModal.id,
        usuario_id: user?.id || null,
        usuario_nombre: user?.nombre || 'Usuario',
        estado_anterior: visitaModal.estadoActual,
        estado_nuevo: visitaModal.nuevoEstado,
        notas: visitaNotas.trim() || null,
      });
      await updateCasa(visitaModal.id, { estado: visitaModal.nuevoEstado });
      toast.success('Visita registrada correctamente');
      setVisitaModal(null);
      setVisitaNotas('');
    } catch {
      toast.error('Error al registrar la visita');
    } finally {
      setSavingVisita(false);
    }
  };

  const IMPORT_ALLOWED_ROLES = ['Super Admin', 'Admin Principal'];

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Dirección', 'Territorio', 'Estado', 'Contacto', 'Teléfono', 'Notas'],
      ['Calle Ejemplo 123', 'Territorio Norte', 'Pendiente', 'Juan Pérez', '555-1234', 'Casa esquina'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Casas');
    XLSX.writeFile(wb, 'plantilla_casas.xlsx');
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      // Skip header row
      const dataRows = rows.slice(1).filter(r => r.some(cell => String(cell).trim() !== ''));
      const parsed = dataRows.map(r => ({
        direccion:       String(r[0] || '').trim(),
        territorioNombre: String(r[1] || '').trim(),
        estado:          String(r[2] || '').trim(),
        nombre_contacto: String(r[3] || '').trim(),
        telefono:        String(r[4] || '').trim(),
        notas:           String(r[5] || '').trim(),
      }));
      // Validate
      const errors = new Set();
      parsed.forEach((row, i) => {
        const terr = territorios.find(t => t.nombre.toLowerCase() === row.territorioNombre.toLowerCase());
        if (!row.direccion || !terr) errors.add(i);
      });
      setImportPreview(parsed);
      setImportErrors(errors);
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importPreview.length) return;
    setImporting(true);
    try {
      const validRows = importPreview
        .map((row, i) => ({ row, i }))
        .filter(({ i }) => !importErrors.has(i))
        .map(({ row }) => {
          const terr = territorios.find(t => t.nombre.toLowerCase() === row.territorioNombre.toLowerCase());
          const estado = STATUS_OPTIONS.includes(row.estado) ? row.estado : 'Pendiente';
          return {
            territorio_id:   terr.id,
            territorio_nombre: terr.nombre,
            direccion:       row.direccion,
            estado,
            nombre_contacto: row.nombre_contacto || null,
            telefono:        row.telefono || null,
            notas:           row.notas || null,
            latitud:         0,
            longitud:        0,
            congregacion_id: user?.congregacion_id || null,
          };
        });

      if (!validRows.length) {
        toast.error('No hay filas válidas para importar');
        return;
      }

      const { error } = await supabase.from('casas').insert(validRows);
      if (error) throw error;
      toast.success(`${validRows.length} ${validRows.length === 1 ? 'casa importada' : 'casas importadas'} correctamente`);
      setImportModal(false);
      setImportPreview([]);
      setImportErrors(new Set());
    } catch (err) {
      toast.error('Error al importar: ' + (err.message || 'Error desconocido'));
    } finally {
      setImporting(false);
    }
  };

  const statsRow = [
    { label: 'Atendidos', count: casas.filter(c => c.estado === 'Atendido').length, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    { label: 'Sin contacto', count: casas.filter(c => c.estado === 'No atendió').length, color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    { label: 'Pendientes', count: casas.filter(c => c.estado === 'Pendiente').length, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    { label: 'No tocar', count: casas.filter(c => c.estado === 'No tocar').length, color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
  ];

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold heading-gradient m-0">Lista de Casas</h1>
          <p className="text-sm mt-0.5 text-secondary">Registro de visitas y estados</p>
        </div>
        <div className="flex items-center gap-2">
          {IMPORT_ALLOWED_ROLES.includes(user?.rol) && (
            <button
              onClick={() => { setImportPreview([]); setImportErrors(new Set()); setImportModal(true); }}
              className="btn btn-outline py-1.5 px-3 text-xs flex items-center gap-1.5"
            >
              <Upload size={13} /> Importar Excel
            </button>
          )}
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
            {filteredCasas.length} / {casas.length}
          </span>
        </div>
      </div>

      {/* Stats mini-bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statsRow.map(s => (
          <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: s.color }}>{s.count}</span>
            <span className="text-xs font-medium text-secondary">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card mb-4 p-4" style={{ borderLeft: '3px solid rgba(59,130,246,0.4)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" />
            <input
              placeholder="Buscar dirección, contacto o zona..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
          <select value={filterTerritory} onChange={e => { setFilterTerritory(e.target.value); setCurrentPage(1); }}>
            <option value="Todos">Todos los territorios</option>
            {territorios.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
            <option value="Todos">Todos los estados</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tabla — desktop */}
      <div className="hidden md:block">
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest w-16 text-secondary">Foto</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-secondary">Dirección</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-secondary">Territorio</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-secondary">Estado</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-secondary">Contacto</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-secondary">Especial</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-right text-secondary">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCasas.length > 0 ? paginatedCasas.map(c => (
                <tr key={c.id} className="transition-colors duration-100" style={{ borderBottom: '1px solid var(--border-color)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td className="px-4 py-3" style={{ borderLeft: `3px solid ${getStatusColor(c.estado)}60` }}>
                    {c.foto_url ? (
                      <button onClick={() => setLightboxUrl(c.foto_url)} className="group relative w-10 h-10 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                        <img src={c.foto_url} alt="casa" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <ZoomIn size={13} className="text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                        <ImageOff size={14} className="text-muted" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-primary">
                    <span className="flex items-center gap-1.5">
                      {c.direccion}
                      {c.audio_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAudioModal({ url: c.audio_url, direccion: c.direccion }); }}
                          title="Reproducir nota de voz"
                          style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                        >
                          <Mic size={13} style={{ color: '#3B82F6' }} />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary">{c.territorio_nombre}</td>
                  <td className="px-4 py-3 text-sm">
                    {editStatusId === c.id ? (
                      <select
                        autoFocus
                        defaultValue={c.estado}
                        onBlur={() => setEditStatusId(null)}
                        onChange={e => {
                          setVisitaModal({ id: c.id, estadoActual: c.estado, nuevoEstado: e.target.value });
                          setVisitaNotas('');
                          setEditStatusId(null);
                        }}
                        className="text-xs py-1 px-2 rounded-lg w-auto"
                        style={{ border: '1px solid rgba(59,130,246,0.5)' }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditStatusId(c.id)}
                        className={`badge cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 ${getStatusBadge(c.estado)}`}
                        title="Clic para cambiar estado"
                      >
                        {c.estado} <ChevronDown size={10} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary">{c.nombre_contacto || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.tiene_caso_especial
                      ? <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>{c.tipo_caso || 'Especial'}</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditTarget(c)}
                        className="btn btn-outline py-1.5 px-3 text-xs flex items-center gap-1"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="btn btn-danger py-1.5 px-3 text-xs flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-gray-400 text-sm">
                    No se encontraron casas con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalItems={filteredCasas.length} itemsPerPage={25} onPageChange={setCurrentPage} />
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-3">
        {filteredCasas.length > 0 ? paginatedCasas.map(c => (
          <div key={c.id} className="card p-4" style={{ borderLeft: `3px solid ${getStatusColor(c.estado)}60` }}>
            <div className="flex items-start gap-3 mb-2">
              {c.foto_url ? (
                <button onClick={() => setLightboxUrl(c.foto_url)} className="w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid var(--border-color)' }}>
                  <img src={c.foto_url} alt="casa" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--bg-hover)' }}>
                  <ImageOff size={16} className="text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="font-bold text-sm truncate text-primary">{c.direccion}</p>
                  {c.audio_url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAudioModal({ url: c.audio_url, direccion: c.direccion }); }}
                      title="Reproducir nota de voz"
                      style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      <Mic size={13} style={{ color: '#3B82F6' }} />
                    </button>
                  )}
                </div>
                <p className="text-xs truncate text-secondary">{c.territorio_nombre}</p>
              </div>
              {editStatusId === c.id ? (
                <select
                  autoFocus
                  defaultValue={c.estado}
                  onBlur={() => setEditStatusId(null)}
                  onChange={e => {
                    setVisitaModal({ id: c.id, estadoActual: c.estado, nuevoEstado: e.target.value });
                    setVisitaNotas('');
                    setEditStatusId(null);
                  }}
                  className="text-xs py-1 px-1.5 rounded-lg shrink-0 w-auto"
                  style={{ border: '1px solid rgba(59,130,246,0.5)' }}
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setEditStatusId(c.id)}
                  className={`badge flex items-center gap-0.5 cursor-pointer hover:opacity-80 shrink-0 ${getStatusBadge(c.estado)}`}
                >
                  {c.estado} <ChevronDown size={10} />
                </button>
              )}
            </div>

            <div className="text-xs space-y-0.5 mb-3 text-secondary">
              {c.nombre_contacto && <div>Contacto: {c.nombre_contacto}</div>}
              {c.tiene_caso_especial && <div className="font-semibold" style={{ color: '#F59E0B' }}>Caso especial: {c.tipo_caso || 'Sí'}</div>}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditTarget(c)}
                className="btn btn-outline py-1.5 px-3 text-xs flex items-center gap-1"
              >
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => setDeleteTarget(c)} className="btn btn-danger py-1.5 px-3 text-xs flex items-center gap-1">
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          </div>
        )) : (
          <div className="card p-10 text-center text-sm text-secondary">
            No se encontraron casas con los filtros actuales.
          </div>
        )}
        <Pagination currentPage={currentPage} totalItems={filteredCasas.length} itemsPerPage={25} onPageChange={setCurrentPage} />
      </div>

      {/* Mini-modal Nota de voz */}
      {audioModal && (
        <ModalOverlay size="small" onClose={() => setAudioModal(null)}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Mic size={16} style={{ color: '#3B82F6' }} />
              <h3 className="text-base font-bold text-primary">Nota de voz</h3>
            </div>
            <p className="text-xs text-secondary mb-3 truncate">{audioModal.direccion}</p>
            <audio controls src={audioModal.url} className="w-full" style={{ width: '100%' }} />
            <div className="flex justify-end mt-4">
              <button className="btn btn-outline" onClick={() => setAudioModal(null)}>Cerrar</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Mini-modal Registrar Visita */}
      {visitaModal && (
        <ModalOverlay size="small" onClose={() => { setVisitaModal(null); setVisitaNotas(''); }}>
          <div>
            <h3 className="text-lg font-bold mb-1 text-primary">Registrar Visita</h3>
            <p className="text-sm mb-4 text-secondary">
              Estado:{' '}
              <span className="font-semibold" style={{ color: getStatusColor(visitaModal.estadoActual) }}>{visitaModal.estadoActual}</span>
              {' → '}
              <span className="font-semibold" style={{ color: getStatusColor(visitaModal.nuevoEstado) }}>{visitaModal.nuevoEstado}</span>
            </p>
            <textarea
              rows={3}
              placeholder="Notas de la visita (opcional)..."
              value={visitaNotas}
              onChange={e => setVisitaNotas(e.target.value)}
              className="w-full resize-none"
              style={{ fontSize: '0.875rem' }}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                className="btn btn-outline"
                onClick={() => { setVisitaModal(null); setVisitaNotas(''); }}
                disabled={savingVisita}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleConfirmVisita}
                disabled={savingVisita}
              >
                {savingVisita && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                Registrar Visita
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Edit house modal — componente creado en tarea 5 */}
      {/* editTarget && <EditHouseModal casa={editTarget} onClose={() => setEditTarget(null)} onSaved={() => setEditTarget(null)} /> */}

      {/* Import Excel modal */}
      {importModal && (
        <ModalOverlay onClose={() => setImportModal(false)}>
          <div>
            <h3 className="text-lg font-bold mb-1 text-primary">Importar casas desde Excel</h3>
            <p className="text-sm mb-4 text-secondary">
              El archivo debe tener las columnas en este orden:{' '}
              <span className="font-semibold text-primary">Dirección, Territorio, Estado, Contacto, Teléfono, Notas</span>
            </p>

            {/* Download template */}
            <button
              onClick={handleDownloadTemplate}
              className="btn btn-outline py-1.5 px-3 text-xs flex items-center gap-1.5 mb-4"
            >
              <Upload size={13} /> Descargar Plantilla
            </button>

            {/* File input */}
            <div
              className="rounded-xl flex flex-col items-center justify-center gap-2 mb-4 cursor-pointer"
              style={{ border: '2px dashed rgba(37,99,235,0.3)', background: 'rgba(37,99,235,0.04)', padding: '1.5rem' }}
              onClick={() => importFileRef.current?.click()}
            >
              <Upload size={22} style={{ color: '#2563EB' }} />
              <p className="text-sm font-medium" style={{ color: '#2563EB' }}>
                {importPreview.length > 0
                  ? `${importPreview.length} filas cargadas — clic para cambiar archivo`
                  : 'Seleccionar archivo .xlsx o .csv'}
              </p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>Formatos soportados: .xlsx, .csv</p>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>

            {/* Preview table */}
            {importPreview.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold mb-2 text-secondary">
                  Vista previa — primeras 5 filas (total: {importPreview.length} filas,{' '}
                  <span style={{ color: '#EF4444' }}>{importErrors.size} con errores</span>,{' '}
                  <span style={{ color: '#10B981' }}>{importPreview.length - importErrors.size} válidas</span>)
                </p>
                <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                        {['Dirección', 'Territorio', 'Estado', 'Contacto', 'Teléfono', 'Notas'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-secondary">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 5).map((row, i) => {
                        const isError = importErrors.has(i);
                        const terr = territorios.find(t => t.nombre.toLowerCase() === row.territorioNombre.toLowerCase());
                        return (
                          <tr
                            key={i}
                            style={{
                              borderBottom: '1px solid var(--border-color)',
                              background: isError ? 'rgba(239,68,68,0.06)' : 'transparent',
                            }}
                          >
                            <td className="px-3 py-2" style={{ color: !row.direccion ? '#EF4444' : '#0F172A' }}>
                              {row.direccion || <em style={{ color: '#EF4444' }}>vacía</em>}
                            </td>
                            <td className="px-3 py-2" style={{ color: !terr ? '#EF4444' : '#0F172A' }}>
                              {row.territorioNombre || '—'}
                              {!terr && row.territorioNombre && (
                                <span style={{ color: '#EF4444' }}> (no encontrado)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-secondary">
                              {STATUS_OPTIONS.includes(row.estado) ? row.estado : (
                                <span>{row.estado || '—'} <em style={{ color: '#94A3B8' }}>(→ Pendiente)</em></span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-secondary">{row.nombre_contacto || '—'}</td>
                            <td className="px-3 py-2 text-secondary">{row.telefono || '—'}</td>
                            <td className="px-3 py-2 text-secondary">{row.notas || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {importPreview.length > 5 && (
                  <p className="text-xs mt-1.5 text-muted">
                    + {importPreview.length - 5} filas más no mostradas en la vista previa
                  </p>
                )}
                {importErrors.size > 0 && (
                  <p className="text-xs mt-2 font-medium" style={{ color: '#EF4444' }}>
                    Las filas en rojo tienen errores: dirección vacía o territorio no encontrado. Solo se importarán las filas válidas.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-outline"
                onClick={() => setImportModal(false)}
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleImport}
                disabled={importing || importPreview.length === 0 || importPreview.length === importErrors.size}
              >
                {importing && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                Importar {importPreview.length - importErrors.size} {importPreview.length - importErrors.size === 1 ? 'casa válida' : 'casas válidas'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar la casa "${deleteTarget.direccion}"?`}
          detail="Esta acción no se puede deshacer."
          confirmText="Sí, eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Lightbox foto */}
      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative animate-scale-in" onClick={e => e.stopPropagation()}>
            <button
              className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                color: 'var(--text-secondary)',
              }}
              onClick={() => setLightboxUrl(null)}
            >
              <X size={16} />
            </button>
            <img
              src={lightboxUrl}
              alt="Foto de la casa"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
              style={{ boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.5)' }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default HousesList;
