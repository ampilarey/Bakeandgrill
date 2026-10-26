import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Maximize2, X } from 'lucide-react';

/*
 * A label as it will print, in a frame the shape of the page (owner,
 * 2026-10-05: "There is no preview in labels"). The sheet route, opened
 * with preview=1, draws the page with no print bar and scales it to the
 * frame's width, so the frame only has to be the right shape: its height
 * follows its width by the page's ratio.
 */

type Props = {
  /** The signed sheet link (relative); null while there is nothing to show. */
  url: string | null;
  /** Page width ÷ height. */
  ratio: number;
  /** True while a fresh link is being fetched; the old page stays until the new one loads. */
  busy?: boolean;
  title?: string;
  /** Shown in the frame when there is no url. */
  empty?: string;
  className?: string;
  /** Round pages are shown in a round frame. */
  round?: boolean;
  /** Drawn over the page, the frame's size: touch zones for the wrap-around label's strips (round 2, 2026-10-13). */
  overlay?: ReactNode;
};

export function SheetPreview({ url, ratio, busy = false, title = 'Preview', empty = 'Pick a product to see it.', className = '', round = false, overlay }: Props) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => { if (url === null) { shown.current = null; setLoaded(null); } }, [url]);
  const src = url ? `${window.location.origin}${url}` : null;
  const pending = Boolean(src) && loaded !== src;
  // Owner, 2026-10-26: "add option to view preview in label bigger … full screen, and option to close".
  const [full, setFull] = useState(false);

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: String(ratio) }} data-testid="sheet-preview">
      <div className={['absolute inset-0 overflow-hidden bg-white border border-[var(--color-border)]', round ? 'rounded-full' : 'rounded-lg'].join(' ')}>
        {src ? (
          <iframe // eslint-disable-line jsx-a11y/no-noninteractive-element-interactions -- onLoad only reveals the frame once drawn
            key={src}
            title={title}
            src={src}
            onLoad={() => { shown.current = src; setLoaded(src); }}
            className="block w-full h-full border-0"
            style={{ opacity: pending ? 0 : 1, transition: 'opacity 150ms' }}
          />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-[var(--color-text-muted)]">{empty}</p>
        )}
      </div>
      {overlay && src && <div className="absolute inset-0" data-testid="sheet-preview-overlay">{overlay}</div>}
      {(busy || pending) && src && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-live="polite" aria-label="Updating the preview">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] shadow-sm"><Loader2 size={14} className="animate-spin" /> Updating</span>
        </div>
      )}
      {src && (
        <button
          type="button"
          onClick={() => setFull(true)}
          aria-label="View bigger"
          title="View bigger"
          data-testid="sheet-preview-bigger"
          className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 border border-[var(--color-border)] text-[var(--color-text-secondary)] shadow-sm"
        >
          <Maximize2 size={15} />
        </button>
      )}
      {full && src && <FullScreenPreview src={src} ratio={ratio} round={round} title={title} onClose={() => setFull(false)} />}
    </div>
  );
}

/*
 * The same page, as big as the screen allows at its own shape, over everything
 * (a label editor is often a pop-up already). Close, a tap outside the page or
 * Escape puts it away; Escape closes only this, not the pop-up underneath.
 */
function FullScreenPreview({ src, ratio, round, title, onClose }: { src: string; ratio: number; round: boolean; title: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div // eslint-disable-line jsx-a11y/no-noninteractive-element-interactions -- a tap on the backdrop closes it; Close and Escape do the same
      role="dialog"
      aria-modal="true"
      aria-label={`${title}, full screen`}
      data-testid="sheet-preview-full"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-dialog-over)' as unknown as number,
        background: 'color-mix(in srgb, var(--color-backdrop) 92%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '56px 16px 16px',
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close full screen"
        data-testid="sheet-preview-full-close"
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white text-[var(--color-text)] text-sm font-semibold shadow"
      >
        <X size={16} /> Close
      </button>
      <div
        className={['overflow-hidden bg-white', round ? 'rounded-full' : 'rounded-lg'].join(' ')}
        style={{ aspectRatio: String(ratio), width: `min(100%, calc((100dvh - 72px) * ${ratio}))` }}
      >
        <iframe title={`${title} (full screen)`} src={src} className="block w-full h-full border-0" />
      </div>
    </div>,
    document.body,
  );
}
