import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmModal = ({
  message,
  detail,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
}) => {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && onCancel) onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}
    >
      <div
        className="w-full max-w-sm animate-scale-in"
        style={{
          background: '#FFFFFF',
          borderRadius: '1.25rem',
          padding: '1.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-full shrink-0 ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle size={20} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <h3 className="text-base font-semibold m-0">Confirmar acción</h3>
        </div>
        <p className="text-sm text-gray-700 mb-1 ml-1">{message}</p>
        {detail && <p className="text-xs text-gray-400 mb-5 ml-1">{detail}</p>}
        {!detail && <div className="mb-5" />}
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn btn-outline flex-1">
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
