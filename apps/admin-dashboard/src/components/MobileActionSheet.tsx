import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE_SEL } from './SharedUI';
import { X } from 'lucide-react';

export type MobileActionSheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  returnFocusTo?: HTMLElement | null;
  /** Stack above editor sheets when needed. */
  layer?: number;
};

/**
 * Bottom action sheet for mobile menus that would otherwise clip off-screen
 * when absolutely positioned to a left-pushed trigger.
 */
export function MobileActionSheet({
  open,
  title = 'Actions',
  onClose,
  children,
  testId,
  returnFocusTo,
  layer = 3,
}: MobileActionSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current =
      returnFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    window.setTimeout(() => closeRef.current?.focus(), 0);
    // The page behind a sheet must not scroll with it (audit A3). Not the
    // shared hook, because this sheet stacks — a nested one must stop Escape
    // propagating rather than closing every layer.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      const target = previouslyFocused.current;
      if (target && typeof target.focus === 'function') {
        window.setTimeout(() => target.focus(), 0);
      }
    };
  }, [open, onClose, returnFocusTo]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="hub-mobile-action-sheet-root"
      style={{ zIndex: 50 + layer * 2 }}
      data-testid={testId ? `${testId}-root` : undefined}
    >
      <button
        type="button"
        className="hub-mobile-action-sheet-backdrop"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const focusable = Array.from(
            panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SEL) ?? [],
          );
          if (!focusable.length) { e.preventDefault(); return; }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
        className="hub-mobile-action-sheet"
        role="menu"
        aria-labelledby={titleId}
        data-testid={testId}
      >
        <div className="hub-mobile-action-sheet-head">
          <span id={titleId} className="hub-mobile-action-sheet-title">{title}</span>
          <button
            ref={closeRef}
            type="button"
            className="hub-mobile-action-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="hub-mobile-action-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
