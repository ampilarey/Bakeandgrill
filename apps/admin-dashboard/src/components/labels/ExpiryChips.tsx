/*
 * One tap for the expiry (owner, 2026-11-12: "add easy expire date selection.
 * 1 month, 2, 3"): the made-on date plus whole calendar months, or back to the
 * label's own shelf life. Used beside every expiry box that takes a date.
 */

/** `mfg` (YYYY-MM-DD) plus `months` calendar months; the 31st of a short month lands on its last day. */
export function monthsAfter(mfg: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mfg);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const last = new Date(Date.UTC(y, mo + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo + months, Math.min(d, last))).toISOString().slice(0, 10);
}

export const EXPIRY_MONTHS = [1, 2, 3, 6] as const;

/** A months pick follows the made-on date when that changes; a typed date stays as typed. */
export function expiryForNewMfg(oldMfg: string, newMfg: string, exp: string): string {
  const n = EXPIRY_MONTHS.find((m) => exp !== '' && monthsAfter(oldMfg, m) === exp);
  return n ? monthsAfter(newMfg, n) : exp;
}

/** A date box that keeps to its column on an iPhone, where a date input brings a width of its own. */
export const DATE_BOX = 'block min-w-0 max-w-full appearance-none';

export function ExpiryChips({ mfg, value, onChange, idPrefix = 'exp' }: {
  /** The made-on date the months count from. */
  mfg: string;
  /** The expiry typed or picked; empty means the label's own shelf life. */
  value: string;
  onChange: (exp: string) => void;
  idPrefix?: string;
}) {
  const chip = (on: boolean) => [
    'h-8 px-3 rounded-full border text-xs font-semibold whitespace-nowrap',
    on ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)] text-[var(--color-tone-rust-text)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]',
  ].join(' ');
  return (
    <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Quick expiry" data-testid={`${idPrefix}-chips`}>
      <button type="button" className={chip(value === '')} aria-pressed={value === ''} onClick={() => onChange('')}>Shelf life</button>
      {EXPIRY_MONTHS.map((n) => {
        const date = monthsAfter(mfg, n);
        return (
          <button key={n} type="button" className={chip(date !== '' && value === date)} aria-pressed={date !== '' && value === date} disabled={date === ''} onClick={() => onChange(date)}>
            {n} {n === 1 ? 'month' : 'months'}
          </button>
        );
      })}
    </div>
  );
}
