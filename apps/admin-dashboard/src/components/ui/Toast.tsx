import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  // Each toast's auto-dismiss timer, cleared when the toast is dismissed by
  // hand and when the provider unmounts. A timer outliving the provider set
  // state on a gone tree (CI, 2026-10-21: "window is not defined" from a
  // timer that fired after a test file's window was torn down).
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 4000));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

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
