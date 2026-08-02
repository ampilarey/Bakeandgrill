import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const sizeStyles: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, size = 'md', children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overlay-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'ui-modal-title' : undefined}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/*
        Panel — `modal-container` is the hook our global mobile @media
        rule targets so the dialog snaps to a full-width bottom sheet
        on phones instead of staying centered with leftover margin
        that pushed the content offscreen.
      */}
      <div className={['modal-container relative w-full bg-white rounded-[14px] shadow-[0_8px_24px_rgba(28,20,8,0.15)] animate-fade-in', sizeStyles[size]].join(' ')}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <h2 id="ui-modal-title" className="text-base font-bold text-[var(--color-text)]">{title}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)] rounded-b-[14px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
