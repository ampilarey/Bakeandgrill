import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ContentItemEditorProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional status / draft banner under the title. */
  status?: ReactNode;
  /** Sticky bottom action bar (Publish, Done, etc.). */
  footer?: ReactNode;
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

function useIsNarrow(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return narrow;
}

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
  layer = 0,
  ariaLabel,
  testId = 'content-item-editor',
  returnFocusTo,
  presentation = 'auto',
}: ContentItemEditorProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const narrow = useIsNarrow();
  const mode = presentation === 'auto' ? (narrow ? 'fullscreen' : 'drawer') : presentation;

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current =
      returnFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
