import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

export type ContentItemEditorProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional status / draft banner under the title. */
  status?: ReactNode;
  /** Sticky bottom action bar (Publish, Done, etc.). */
  footer?: ReactNode;
  /** Optional controls in the header row (locale, Preview, More). */
  headerActions?: ReactNode;
  /** Nesting depth for stacking above parent sheets (0 = base). */
  layer?: number;
  ariaLabel?: string;
  testId?: string;
  returnFocusTo?: HTMLElement | null;
  /**
   * auto — fullscreen below 768px, large right drawer on desktop.
   * fullscreen / drawer — force a presentation.
   */
  presentation?: 'auto' | 'fullscreen' | 'drawer';
};

/**
 * Responsive focused editor for Content & Branding.
 * Mobile: full-screen sheet. Desktop: wide right drawer with backdrop.
 * Portals to document.body; preserves focus and body scroll lock.
 */
export function ContentItemEditor({
  open,
  title,
  onClose,
  children,
  status,
  footer,
  headerActions,
  layer = 0,
  ariaLabel,
  testId = 'content-item-editor',
  returnFocusTo,
  presentation = 'auto',
}: ContentItemEditorProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const narrow = useIsMobile();
  const mode = presentation === 'auto' ? (narrow ? 'fullscreen' : 'drawer') : presentation;

  // Held in refs so the effect below can use the latest values without
  // listing them as dependencies. See the comment on that effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusToRef = useRef(returnFocusTo);
  returnFocusToRef.current = returnFocusTo;

  /**
   * Open / close only.
   *
   * Owner, mobile: "cannot edit/write text in hero banner parts, after one
   * character keyboard lost." This effect used to depend on `onClose` and
   * `returnFocusTo`, and every caller passes an inline arrow — a new identity
   * on every render. Typing re-renders the parent, so the effect tore down and
   * re-ran on each keystroke, and its first act is to focus the close button.
   * Focus left the textarea, and on a phone the keyboard closes with it.
   *
   * Nothing in here should re-run while the sheet stays open, so `open` is the
   * only real dependency; the callbacks are read from refs at the moment they
   * are needed.
   */
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current =
      returnFocusToRef.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
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
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const z = 50 + layer * 2;

  return createPortal(
    <div
      className={`content-item-editor-root content-item-editor-root--${mode}`}
      data-testid={`${testId}-root`}
      data-presentation={mode}
      style={{ zIndex: z }}
    >
      {mode === 'drawer' ? (
        <button
          type="button"
          className="content-item-editor-backdrop"
          aria-label="Close editor"
          data-testid={`${testId}-backdrop`}
          onClick={onClose}
        />
      ) : null}
      <div
        className={`content-editor-sheet content-item-editor content-item-editor--${mode}`}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
      >
        <header className="content-editor-sheet-header">
          <div className="content-editor-sheet-header-row">
            <h2 id={titleId} className="content-editor-sheet-title">{title}</h2>
            {headerActions ? (
              <div className="content-editor-sheet-header-actions" data-testid="content-editor-sheet-header-actions">
                {headerActions}
              </div>
            ) : null}
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
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated Prefer ContentItemEditor — kept as a thin alias for existing call sites. */
export { ContentItemEditor as ContentEditorSheetResponsive };
