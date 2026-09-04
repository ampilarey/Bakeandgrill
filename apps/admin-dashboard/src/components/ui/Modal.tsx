import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogChrome } from '../SharedUI';

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

/*
 * Gate and panel are separate so the panel can call `useDialogChrome`
 * unconditionally.
 *
 * The layout audit (A7, 2026-09-03) recorded this component as unused and
 * proposed deleting it. That is wrong: VideoStudioModal imports `Modal` from
 * the `ui` barrel rather than by path, which is what the audit's search
 * missed. So it is fixed rather than removed — it had Escape and the aria and
 * none of the other three (A3).
 */
export function Modal(props: Props) {
  if (!props.open) return null;

  return <ModalPanel {...props} />;
}

function ModalPanel({ onClose, title, size = 'md', children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogChrome(onClose, panelRef);

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 overlay-enter"
      style={{ zIndex: 'var(--z-dialog-over)' as unknown as number }}
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
        Panel — `modal-container` is the hook our global mobile @media rule
        targets so the dialog snaps to a full-width bottom sheet on phones.
        That rule is scoped `.modal-backdrop .modal-container`, and until
        2026-09-04 this component rendered no backdrop, so it got none of it:
        no max-height, no bottom sheet, and a long dialog ran off the bottom
        of a phone with nothing to scroll (audit A7).
      */}
      <div ref={panelRef} className={['modal-container relative w-full bg-white rounded-[14px] shadow-[0_8px_24px_rgba(28,20,8,0.15)] animate-fade-in', sizeStyles[size]].join(' ')}>
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
    </div>,
    document.body,
  );
}
