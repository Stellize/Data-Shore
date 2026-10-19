import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLockBody } from '../hooks.js';

export default function Modal({
  open,
  onClose,
  children,
  className = '',
  label = 'Dialog',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  useLockBody(open);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panelRef}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
