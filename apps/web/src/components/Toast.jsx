import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = 'default', duration = 4200 } = {}) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
            <span className="toast-icon">
              {toast.tone === 'error' ? (
                <AlertTriangle size={16} />
              ) : toast.tone === 'success' ? (
                <Check size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
