import React, { useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, Database, FileJson } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../supabaseClient';

const Backup = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Export state
  const [exporting, setExporting] = useState(false);

  // Restore state
  const [backupFile, setBackupFile] = useState(null);
  const [backupData, setBackupData] = useState(null);
  const [parseError, setParseError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0=none, 1=first, 2=second

  // ─── EXPORT ─────────────────────────────────────────────────────────────────

  const fetchTable = async (table, filters = {}) => {
    try {
      let query = supabase.from(table).select('*');
      if (filters.congregacion_id) {
        query = query.eq('congregacion_id', filters.congregacion_id);
      }
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const congregacion_id = user.congregacion_id;

      const [territorios, casas, usuarios, congregaciones] = await Promise.all([
        fetchTable('territorios', { congregacion_id }),
        fetchTable('casas'),
        fetchTable('app_usuarios', { congregacion_id }),
        fetchTable('congregaciones'),
      ]);

      // Tables that may not exist — wrapped individually
      let historial_visitas = [];
      let asignaciones = [];
      let notificaciones = [];

      try {
        const { data } = await supabase.from('historial_visitas').select('*');
        historial_visitas = data || [];
      } catch { /* tabla no existe */ }

      try {
        const { data } = await supabase.from('territorio_asignaciones').select('*');
        asignaciones = data || [];
      } catch { /* tabla no existe */ }

      try {
        const { data } = await supabase
          .from('notificaciones')
          .select('*')
          .eq('usuario_destino_id', user.id);
        notificaciones = data || [];
      } catch { /* tabla no existe */ }

      const fecha = new Date().toISOString().slice(0, 10);

      const payload = {
        metadata: {
          fecha: new Date().toISOString(),
          version: '1.0',
          congregacion_id,
        },
        territorios,
        casas,
        usuarios,
        congregaciones,
        historial_visitas,
        asignaciones,
        notificaciones,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_territorial_${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Backup descargado correctamente', 'success');
    } catch (err) {
      showToast('Error al generar el backup: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── RESTORE ────────────────────────────────────────────────────────────────

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBackupFile(file);
    setBackupData(null);
    setParseError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.metadata || !parsed.territorios) {
          throw new Error('Archivo de backup inválido o incompleto.');
        }
        setBackupData(parsed);
      } catch (err) {
        setParseError(err.message || 'No se pudo leer el archivo JSON.');
        setBackupFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreClick = () => {
    setConfirmStep(1);
  };

  const handleFirstConfirm = () => {
    setConfirmStep(2);
  };

  const handleSecondConfirm = async () => {
    setConfirmStep(0);
    setRestoring(true);
    try {
      const { congregaciones, territorios, casas, usuarios } = backupData;
      const congregacion_id = user.congregacion_id;

      // Delete in reverse dependency order
      await supabase.from('casas').delete().neq('id', 0);
      await supabase.from('territorios').delete().eq('congregacion_id', congregacion_id);
      await supabase.from('app_usuarios').delete().eq('congregacion_id', congregacion_id);

      // Insert in correct order: congregaciones → territorios → casas → app_usuarios
      if (congregaciones && congregaciones.length > 0) {
        const { error } = await supabase.from('congregaciones').upsert(congregaciones, { onConflict: 'id' });
        if (error) throw new Error('Error restaurando congregaciones: ' + error.message);
      }

      if (territorios && territorios.length > 0) {
        const { error } = await supabase.from('territorios').insert(territorios);
        if (error) throw new Error('Error restaurando territorios: ' + error.message);
      }

      if (casas && casas.length > 0) {
        const { error } = await supabase.from('casas').insert(casas);
        if (error) throw new Error('Error restaurando casas: ' + error.message);
      }

      if (usuarios && usuarios.length > 0) {
        const { error } = await supabase.from('app_usuarios').insert(usuarios);
        if (error) throw new Error('Error restaurando usuarios: ' + error.message);
      }

      showToast('Backup restaurado correctamente', 'success');
      setBackupFile(null);
      setBackupData(null);
    } catch (err) {
      showToast('Error al restaurar: ' + err.message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleCancelConfirm = () => {
    setConfirmStep(0);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-page-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold heading-gradient mb-1">Backup del Sistema</h1>
        <p className="text-sm text-secondary">Exporta o restaura todos los datos de la congregación.</p>
      </div>

      {/* Export Section */}
      <div
        className="card mb-6 p-6"
        style={{ border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(37,99,235,0.1)' }}
          >
            <Database size={20} style={{ color: '#2563EB' }} />
          </div>
          <div>
            <h2 className="text-base font-bold text-primary">Exportar Backup</h2>
            <p className="text-xs text-secondary">
              Descarga un archivo JSON con todos los datos actuales.
            </p>
          </div>
        </div>

        <div
          className="rounded-xl p-4 mb-4 text-sm"
          style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)' }}
        >
          <p className="text-secondary leading-relaxed">
            El backup incluye: territorios, casas, usuarios, congregaciones, historial de visitas,
            asignaciones y notificaciones.
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn btn-primary flex items-center gap-2"
          style={{ opacity: exporting ? 0.7 : 1 }}
        >
          <Download size={16} />
          {exporting ? 'Generando backup...' : 'Descargar Backup Completo'}
        </button>
      </div>

      {/* Restore Section */}
      <div
        className="card p-6"
        style={{ border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(220,38,38,0.1)' }}
          >
            <Upload size={20} style={{ color: '#DC2626' }} />
          </div>
          <div>
            <h2 className="text-base font-bold text-primary">Restaurar Backup</h2>
            <p className="text-xs text-secondary">
              Importa un archivo de backup generado previamente.
            </p>
          </div>
        </div>

        {/* Warning */}
        <div
          className="rounded-xl p-4 mb-4 flex items-start gap-3"
          style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)' }}
        >
          <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
            Esto reemplazará TODOS los datos actuales. Esta acción es irreversible.
          </p>
        </div>

        {/* File input */}
        <label
          className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer transition-colors mb-4"
          style={{
            border: '2px dashed var(--border-color)',
            padding: '1.5rem 1rem',
            background: backupData ? 'rgba(16,185,129,0.05)' : 'var(--bg-hover)',
          }}
        >
          <FileJson size={28} style={{ color: backupData ? '#10B981' : '#94A3B8' }} />
          <span className="text-sm font-medium text-secondary">
            {backupFile ? backupFile.name : 'Seleccionar archivo .json'}
          </span>
          <span className="text-xs text-muted">Haz clic para elegir</span>
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>

        {/* Parse error */}
        {parseError && (
          <div
            className="rounded-lg p-3 mb-4 text-sm"
            style={{ background: 'rgba(220,38,38,0.07)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}
          >
            {parseError}
          </div>
        )}

        {/* Summary */}
        {backupData && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} style={{ color: '#10B981' }} />
              <span className="text-sm font-semibold" style={{ color: '#10B981' }}>
                Archivo válido
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary">Territorios:</span>
                <span className="font-semibold text-primary">{backupData.territorios?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Casas:</span>
                <span className="font-semibold text-primary">{backupData.casas?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Usuarios:</span>
                <span className="font-semibold text-primary">{backupData.usuarios?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Congregaciones:</span>
                <span className="font-semibold text-primary">{backupData.congregaciones?.length ?? 0}</span>
              </div>
            </div>
            {backupData.metadata?.fecha && (
              <p className="text-xs text-muted mt-3">
                Backup generado el{' '}
                {new Date(backupData.metadata.fecha).toLocaleString('es-MX', {
                  day: '2-digit', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleRestoreClick}
          disabled={!backupData || restoring}
          className="btn btn-danger flex items-center gap-2"
          style={{ opacity: !backupData || restoring ? 0.5 : 1, cursor: !backupData ? 'not-allowed' : 'pointer' }}
        >
          <Upload size={16} />
          {restoring ? 'Restaurando...' : 'Restaurar Backup'}
        </button>
      </div>

      {/* First confirmation */}
      {confirmStep === 1 && (
        <ConfirmModal
          message="¿Seguro que deseas restaurar este backup?"
          detail="Todos los datos actuales serán eliminados y reemplazados. Esta acción no se puede deshacer."
          confirmText="Sí, continuar"
          cancelText="Cancelar"
          danger
          onConfirm={handleFirstConfirm}
          onCancel={handleCancelConfirm}
        />
      )}

      {/* Second confirmation */}
      {confirmStep === 2 && (
        <ConfirmModal
          message="Confirmación final: esta acción es IRREVERSIBLE."
          detail="Se borrarán y reemplazarán casas, territorios y usuarios. ¿Deseas proceder?"
          confirmText="Restaurar ahora"
          cancelText="Cancelar"
          danger
          onConfirm={handleSecondConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
};

export default Backup;
