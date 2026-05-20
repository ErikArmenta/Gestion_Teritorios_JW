import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const ModalOverlay = ({ children, onClose, size = 'default' }) => {
  // Bloquear scroll del body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Tamaños responsive: en móvil siempre full, en PC varía según size
  const sizeClasses = {
    small:   'w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-[60vw] lg:max-w-[45vw] xl:max-w-[35vw]',
    default: 'w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[70vw] lg:max-w-[55vw] xl:max-w-[45vw]',
    large:   'w-full max-w-[95vw] sm:max-w-[92vw] md:max-w-[80vw] lg:max-w-[65vw] xl:max-w-[55vw]',
    full:    'w-full max-w-[96vw] sm:max-w-[94vw] md:max-w-[85vw] lg:max-w-[75vw] xl:max-w-[65vw]',
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div
        className={`${sizeClasses[size] || sizeClasses.default} animate-scale-in my-auto`}
        style={{
          background: '#FFFFFF',
          borderRadius: '1.25rem',
          padding: '1.75rem',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0,0,0,0.08)',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default ModalOverlay;
