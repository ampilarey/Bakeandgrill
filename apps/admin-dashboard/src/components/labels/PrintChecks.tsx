import { useState } from 'react';
import { Clock, Lock, Scissors } from 'lucide-react';
import type { StickerSummary } from '../../api';
import { Modal } from '../SharedUI';
import { WordingSignoff } from './WordingSignoff';

/*
 * What a print would meet, said before Prepare (label audit, Batch B,
 * 2026-10-16). The preview's summary carries both: `wording`, the products
 * the wording lock would refuse (the same words as the refusal, with Sign
 * off beside each), and `dropped`, the parts of the previewed product this
 * size could not draw. The preview still draws either way.
 */

export type WordingRefusal = NonNullable<StickerSummary['wording']>;

/** True while the lock would refuse a real print of this sheet. */
export const wordingRefused = (s: StickerSummary | null | undefined): boolean => (s?.wording?.refused.length ?? 0) > 0;

export function WordingLockNotice({ wording, canManage, onSigned }: { wording: WordingRefusal | null | undefined; canManage: boolean; onSigned: () => void }) {
  const [open, setOpen] = useState<WordingRefusal['refused'][number] | null>(null);
  if (!wording || wording.refused.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg p-3 text-xs space-y-2" style={{ background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)', color: 'var(--color-text)' }} data-testid="wording-lock-notice">
      <p className="flex items-start gap-1.5 m-0"><Lock size={14} className="mt-0.5 shrink-0 text-[var(--color-danger)]" aria-hidden /> {wording.message}</p>
      <div className="flex flex-wrap gap-2">
        {wording.refused.map((p) => (
          <button key={p.key} type="button" onClick={() => setOpen(p)} className="h-8 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-primary)]" data-testid={`wording-signoff-open-${p.key}`}>
            {canManage ? `Sign off ${p.name}` : `See ${p.name}'s lines`}
          </button>
        ))}
      </div>
      {open && (
        <Modal title={`Wording of ${open.name}`} onClose={() => setOpen(null)} maxWidth={560}>
          <WordingSignoff kind={open.kind} id={open.id} size={open.size ?? null} canManage={canManage} onChange={(s) => { if (s.state === 'signed') { setOpen(null); onSigned(); } }} />
        </Modal>
      )}
    </div>
  );
}

/** "Did not fit on this size: …", under the preview. */
export function DroppedNote({ dropped }: { dropped: string[] | null | undefined }) {
  if (!dropped || dropped.length === 0) return null;
  return (
    <p className="text-xs flex items-start gap-1.5 text-[var(--color-text-secondary)]" data-testid="sticker-dropped">
      <Scissors size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
      <span>Did not fit on this size: {dropped.join(', ')}. A bigger size prints them.</span>
    </p>
  );
}

/** The links Prepare hands back expire; said beside the button. */
export function LinkLifeNote() {
  return (
    <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5 m-0" data-testid="link-life-note">
      <Clock size={13} aria-hidden /> The print and PDF links last 30 minutes. Prepare again after that.
    </p>
  );
}

/** A shelf life this short is easy to print with the wrong dates (2026-10-12): marked wherever the dates are shown. */
export const SHORT_LIFE_DAYS = 3;

export function ShortLifeChip({ days }: { days: number | null | undefined }) {
  if (days === null || days === undefined || days > SHORT_LIFE_DAYS) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold align-middle" style={{ background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)' }} data-testid="short-life">
      <Clock size={11} aria-hidden /> Short life · {days} {days === 1 ? 'day' : 'days'}
    </span>
  );
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The use-by the print will carry, on the wizard's last step. */
export function UseByLine({ exp, shelf, fill }: { exp: string | null | undefined; shelf: number | null | undefined; fill: boolean }) {
  return (
    <p className="text-sm text-[var(--color-text)]" data-testid="make-use-by">
      {!fill ? 'Dates: blank boxes, written by hand.' : exp ? <>Use by <strong>{longDate(exp)}</strong> on every label.</> : 'No use-by: the product has no shelf life set. Type one at step 3 or leave the box blank.'}
      {fill && <ShortLifeChip days={shelf} />}
    </p>
  );
}
