import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ContentEditorSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional status / “not live yet” banner under the title. */
  status?: ReactNode;
  /** Sticky bottom action bar (Publish, Done, etc.). */
  footer?: ReactNode;
  /** Nesting depth for stacking above parent sheets (0 = base). */
  layer?: number;
  /** Accessible name override. */
  ariaLabel?: string;
  testId?: string;
  /** Element to restore focus to on close. */
  returnFocusTo?: HTMLElement | null;
};

/**
 * Full-screen mobile editor sheet. Portals to document.body so cards cannot clip it.
 * Desktop callers should not mount this — Content Hub gates on useIsMobile().
 */
export function ContentEditorSheet({
  open,
  title,
  onClose,
  children,
  status,
  footer,
  layer = 0,
  ariaLabel,
  testId = 'content-editor-sheet',
  returnFocusTo,
}: ContentEditorSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current =
      returnFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the close control on open for keyboard users.
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
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

  const z = 50 + layer * 2;

  return createPortal(
    <div
      className="content-editor-sheet"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={ariaLabel}
      style={{ zIndex: z }}
    >
      <header className="content-editor-sheet-header">
        <div className="content-editor-sheet-header-row">
          <h2 id={titleId} className="content-editor-sheet-title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="content-editor-sheet-close"
            data-testid="content-editor-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {status ? (
          <div className="content-editor-sheet-status" data-testid="content-editor-sheet-status">
            {status}
          </div>
        ) : null}
      </header>
      <div className="content-editor-sheet-body">{children}</div>
      {footer ? (
        <footer className="content-editor-sheet-footer">{footer}</footer>
      ) : null}
    </div>,
    document.body,
  );
}
