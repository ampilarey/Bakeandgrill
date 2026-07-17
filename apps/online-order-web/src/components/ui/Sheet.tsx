import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  children: ReactNode;
  /** Optional footer (e.g. StickyCtaBar) rendered below the scroll body. */
  footer?: ReactNode;
  /** Accessible name when title is omitted. */
  ariaLabel?: string;
};

/**
 * Bottom sheet dialog. Focus trap + Escape/backdrop close (same contract as Modal).
 * Does not push history in Phase 1 — Phase 3 sheets may add pushState.
 */
export function Sheet({
  open,
  onClose,
  title,
  titleId,
  children,
  footer,
  ariaLabel,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const autoTitleId = useId();
  const labelId = titleId ?? autoTitleId;

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-root" role="presentation">
      <div
        className="sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        aria-label={!title ? ariaLabel ?? 'Dialog' : undefined}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem var(--page-gutter) 0.5rem', gap: '0.5rem' }}>
          {title ? (
            <h2 id={labelId} style={{ margin: 0, flex: 1, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)' }}>
              {title}
            </h2>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 'var(--touch-target)',
              height: 'var(--touch-target)',
              border: 'none',
              borderRadius: '999px',
              background: 'var(--color-surface-alt)',
              color: 'var(--color-text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
