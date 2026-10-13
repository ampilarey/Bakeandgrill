import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { SheetPreview } from './SheetPreview';

/*
 * The live preview on a phone or tablet (Labels audit, 2026-10-11). Below the
 * desktop band the preview sat under the whole form, so a size or wording
 * change happened out of sight and the page had to be scrolled to the end to
 * see it. This bar pins the preview under the header: a thumbnail that
 * redraws as the form changes, with its controls beside it, and a tap opens
 * it at full width.
 */

type Props = {
  url: string | null;
  /** Page width ÷ height. */
  ratio: number;
  busy?: boolean;
  round?: boolean;
  title: string;
  /** One line under the controls: what is shown. */
  caption?: ReactNode;
  error?: string | null;
  /** Shown in the frame while there is nothing to draw. */
  empty?: string;
  /** Sticker / Sheet, the product list: sit beside the thumbnail. */
  controls?: ReactNode;
  /** Touch zones over the big preview (the wrap-around label's strips, round 2, 2026-10-13). */
  overlay?: ReactNode;
};

const THUMB_H = 84;

export function PhonePreviewBar({ url, ratio, busy = false, round = false, title, caption, error, empty = 'Pick a product to see it.', controls, overlay }: Props) {
  const [open, setOpen] = useState(false);
  const thumbW = Math.min(150, Math.round(THUMB_H * ratio));
  return (
    <div className="labels-phone-preview" data-testid="phone-preview-bar" data-open={open ? 'true' : 'false'}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg" aria-label={open ? 'Hide the big preview' : 'Show the big preview'} aria-expanded={open} style={{ width: open ? 0 : thumbW, overflow: 'hidden', transition: 'width 0.15s' }}>
          {/* The drawn page is an iframe, which would swallow the tap once loaded (round 9, 2026-10-13): the thumbnail takes no pointer events, so the button gets every tap. */}
          <div style={{ width: thumbW, pointerEvents: 'none' }}>
            <SheetPreview url={url} ratio={ratio} busy={busy} round={round} title={title} empty="" />
          </div>
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--color-text)] inline-flex items-center gap-1.5"><Eye size={15} className="text-[var(--color-primary)]" /> Preview</span>
            <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto h-8 min-w-[32px] px-2 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)]" aria-expanded={open}>
              {open ? <><ChevronUp size={14} aria-hidden /> Smaller</> : <><ChevronDown size={14} aria-hidden /> Bigger</>}
            </button>
          </div>
          {controls}
          {error ? (
            <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>
          ) : (
            caption && <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{caption}</p>
          )}
        </div>
      </div>
      {open && (
        <div className={`mt-2 mx-auto ${round ? 'max-w-[260px]' : ratio > 2 ? 'max-w-full' : 'max-w-[300px]'}`} data-testid="phone-preview-big">
          <SheetPreview url={url} ratio={ratio} busy={busy} round={round} title={title} empty={empty} overlay={overlay} />
        </div>
      )}
    </div>
  );
}
