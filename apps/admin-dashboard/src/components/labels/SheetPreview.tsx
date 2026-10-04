import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
};

export function SheetPreview({ url, ratio, busy = false, title = 'Preview', empty = 'Pick a product to see it.', className = '', round = false }: Props) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => { if (url === null) { shown.current = null; setLoaded(null); } }, [url]);
  const src = url ? `${window.location.origin}${url}` : null;
  const pending = Boolean(src) && loaded !== src;

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
      {(busy || pending) && src && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-live="polite" aria-label="Updating the preview">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] shadow-sm"><Loader2 size={14} className="animate-spin" /> Updating</span>
        </div>
      )}
    </div>
  );
}
