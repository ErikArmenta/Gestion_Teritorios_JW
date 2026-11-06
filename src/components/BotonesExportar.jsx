import React, { useState } from 'react';
import { FileSpreadsheet, FileText, LayoutDashboard, Loader2 } from 'lucide-react';
import { useToast } from './Toast';
import { t } from '../i18n';

// Excel · PDF · Reporte interactivo con el mismo modelo de reporte (utils/reportes/comun.js).
// armar(): devuelve el modelo (puede ser async). formatos: cuáles mostrar.
const FORMATOS = {
  excel: { etiqueta: 'Excel', Icono: FileSpreadsheet, cargar: () => import('../utils/reportes/excel').then((m) => m.exportarExcel) },
  pdf: { etiqueta: 'PDF', Icono: FileText, cargar: () => import('../utils/reportes/pdf').then((m) => m.exportarPDF) },
  html: { etiqueta: 'Reporte interactivo', Icono: LayoutDashboard, cargar: () => import('../utils/reportes/interactivo').then((m) => m.exportarInteractivo) },
};

const BotonesExportar = ({ armar, formatos = ['excel', 'pdf', 'html'], disabled = false, className = '', clase = 'btn btn-outline text-sm' }) => {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(null);

  const exportar = async (f) => {
    if (ocupado) return;
    setOcupado(f);
    try {
      const [fn, reporte] = await Promise.all([FORMATOS[f].cargar(), armar()]);
      await fn(reporte);
      toast.success(f === 'html' ? t('Reporte interactivo descargado') : t('Archivo descargado'));
    } catch (err) {
      console.error(err);
      toast.error(t('No se pudo generar el archivo: ') + (err?.message || err));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {formatos.map((f) => {
        const { etiqueta, Icono } = FORMATOS[f];
        return (
          <button key={f} type="button" className={`${clase} flex items-center gap-1.5`} onClick={() => exportar(f)}
            disabled={disabled || !!ocupado} title={t(etiqueta)}>
            {ocupado === f ? <Loader2 size={15} className="animate-spin" /> : <Icono size={15} />}
            {t(etiqueta)}
          </button>
        );
      })}
    </div>
  );
};

export default BotonesExportar;
