import { Minus, Plus } from 'lucide-react';

/*
 * A count with − and + either side: on a phone a bare number box means a tap,
 * a keyboard, select-all and retype just to go from 4 to 8. The middle still
 * takes typing. Steps by `step` to the next or previous whole multiple, so
 * stickers step a sheet at a time (4, 8, 12) even after typing 6.
 */
export function QtyStepper({ value, onChange, min = 0, max = 9999, step = 1, label }: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name of the number box, e.g. "How many Bajiya stickers". */
  label: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const up = () => clamp((Math.floor(value / step) + 1) * step);
  const down = () => clamp(value % step ? value - (value % step) : value - step);
  const btn = 'w-11 h-11 shrink-0 inline-flex items-center justify-center text-[var(--color-text)] disabled:opacity-40 hover:bg-[var(--color-bg)]';
  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(down())} aria-label={`${label}: fewer`}><Minus size={16} /></button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        onFocus={(e) => e.target.select()}
        className="w-14 h-11 text-center text-sm font-semibold text-[var(--color-text)] border-x border-[var(--color-border)] bg-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={label}
      />
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(up())} aria-label={`${label}: more`}><Plus size={16} /></button>
    </div>
  );
}
