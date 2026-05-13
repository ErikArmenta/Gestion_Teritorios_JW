import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const CONFIGS = {
  success: { icon: CheckCircle, cls: 'border-emerald-200 bg-emerald-50', iconCls: 'text-emerald-500' },
  error:   { icon: XCircle,     cls: 'border-red-200 bg-red-50',         iconCls: 'text-red-500' },
  warning: { icon: AlertTriangle,cls: 'border-amber-200 bg-amber-50',    iconCls: 'text-amber-500' },
  info:    { icon: Info,         cls: 'border-blue-200 bg-blue-50',       iconCls: 'text-blue-500' },
};

const ToastItem = ({ toast, onRemove }) => {
  const cfg = CONFIGS[toast.type] || CONFIGS.info;
  const Icon = cfg.icon;

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div className={`toast-item flex items-start gap-3 p-4 rounded-xl border shadow-lg w-80 max-w-[calc(100vw-2rem)] ${cfg.cls}`}>
      <Icon size={18} className={`${cfg.iconCls} shrink-0 mt-0.5`} />
      <span className="text-sm text-gray-800 flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5"
      >
        <X size={15} />
      </button>
    </div>
  );
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    setToasts(prev => [...prev, { id: Date.now() + Math.random(), message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error:   (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info:    (msg, dur) => addToast(msg, 'info', dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
