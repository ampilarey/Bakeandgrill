import { Move } from 'lucide-react';
import { Btn, Switch } from '../SharedUI';

/*
 * The drag designer's controls (round 8, owner, 2026-10-13): a switch that
 * turns the preview's tap zones into handles to move and resize parts by,
 * and Back to automatic, which puts everything where the design puts it.
 */
export function ArrangeBar({ on, onToggle, canReset, onReset, compact = false }: {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** The design has parts moved by hand. */
  canReset: boolean;
  onReset: () => void;
  /** On a phone's preview bar: the switch and the button alone. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-1" data-testid="arrange-bar" data-on={on ? 'true' : 'false'}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text)] cursor-pointer">
          <Switch checked={on} onChange={onToggle} aria-label="Move and resize parts" data-testid="arrange-switch" />
          <span className="inline-flex items-center gap-1"><Move size={13} aria-hidden /> Move and resize</span>
        </label>
        <Btn variant="secondary" small onClick={onReset} disabled={!canReset} data-testid="arrange-reset">Back to automatic</Btn>
      </div>
      {!compact && (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="arrange-hint">
          {on ? 'Drag a part to move it; drag its corner to resize it. Arrow keys nudge, + and − resize. Only this size’s design changes.' : 'Switch on to drag the parts about; off, a tap opens a part’s boxes.'}
        </p>
      )}
    </div>
  );
}
