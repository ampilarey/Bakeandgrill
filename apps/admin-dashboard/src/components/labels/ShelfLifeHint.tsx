import type { LabelStorage, ShelfLifeSuggestions } from '../../api';

/*
 * A shelf-life suggestion by storage (round 15, owner 2026-10-13: "a
 * shelf-life suggestion by storage type"): under a shelf-life box, what a
 * cooked short eat usually keeps for at that storage, with Use to fill it.
 * Said only when the box is empty or holds something else; a starting point
 * the owner checks, never printed by itself.
 */
const STORAGE_WORDS: Record<LabelStorage, string> = { frozen: 'frozen', chilled: 'chilled', ambient: 'room temperature' };

type Props = {
  storage: LabelStorage | null | undefined;
  /** What the box holds now, as typed. */
  value: string | number | null | undefined;
  suggestions: ShelfLifeSuggestions | null | undefined;
  onUse?: (days: number) => void;
  disabled?: boolean;
  testId?: string;
};

export function ShelfLifeHint({ storage, value, suggestions, onUse, disabled, testId = 'shelf-life-hint' }: Props) {
  const s = storage && suggestions ? suggestions[storage] : null;
  if (!s || !storage) return null;
  const now = value === null || value === undefined || value === '' ? null : Number(value);
  if (now === s.days) return null;
  return (
    <p className="text-xs text-[var(--color-text-muted)] mt-1 flex flex-wrap items-center gap-x-2" data-testid={testId} title={s.why}>
      <span>Usual for {STORAGE_WORDS[storage]}: {s.days} {s.days === 1 ? 'day' : 'days'}.</span>
      {onUse && !disabled && (
        <button type="button" className="underline font-semibold text-[var(--color-tone-rust-text)]" onClick={() => onUse(s.days)}>Use {s.days}</button>
      )}
      <span className="basis-full">{s.why}</span>
    </p>
  );
}
