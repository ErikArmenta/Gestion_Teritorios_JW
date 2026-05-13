import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmModal = ({
  message,
  detail,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
}) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
    <div className="card w-full max-w-sm animate-scale-in">
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

export default ConfirmModal;
