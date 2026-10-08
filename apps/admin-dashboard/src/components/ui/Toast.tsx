import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} />,
  error:   <XCircle size={16} />,
  info:    <Info size={16} />,
  warning: <AlertTriangle size={16} />,
};

const styles: Record<ToastType, string> = {
  success: 'bg-[var(--color-success-bg)] border-[var(--color-success)] text-[var(--color-success-strong)]',
  error:   'bg-[var(--color-danger-bg)] border-[var(--color-danger)] text-[var(--color-danger-strong)]',
  info:    'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]',
  warning: 'bg-[var(--color-warning-bg)] border-[var(--color-warning)] text-[var(--color-warning-strong)]',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const value: ToastContextValue = {
    toast,
    success: (m) => toast('success', m),
    error:   (m) => toast('error', m),
    info:    (m) => toast('info', m),
    warning: (m) => toast('warning', m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: 'var(--z-toast)' as unknown as number }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={['pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[10px] border shadow-md text-sm font-medium toast-enter min-w-[260px] max-w-[380px]', styles[t.type]].join(' ')}
          >
            {icons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity ml-1"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
