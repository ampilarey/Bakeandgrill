import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ─── Internal toast stack renderer ───────────────────────────────────────────

const VARIANT_BG: Record<ToastVariant, string> = {
  success: 'var(--color-success)',
  error:   'var(--color-error)',
  info:    'var(--color-primary)',
};

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: '5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 'var(--z-toast)' as unknown as number,
        width: '100%',
        maxWidth: '360px',
        padding: '0 1rem',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-fade-in"
          style={{
            background: VARIANT_BG[toast.variant],
            color: 'white',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-lg)',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            pointerEvents: 'auto',
          }}
          role="alert"
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', opacity: 0.8, padding: '0', flexShrink: 0, lineHeight: 1 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
