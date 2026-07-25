/** Convert laar (integer cents) to MVR decimal string, e.g. 1250 → "12.50" */
export function laarToMvr(laar: number): string {
  return Number.isFinite(laar) ? (laar / 100).toFixed(2) : '0.00';
}

/** Menu / offers card price: "12.50/-" (no MVR prefix). */
export function formatCardPrice(n: number): string {
  return `${Number(n).toFixed(2)}/-`;
}

/**
 * Savings chip for discounted unit prices — prefer "X% OFF", else "Save N/-".
 * Presentation only; callers pass already-computed original vs sale.
 */
export function formatSavingsLabel(original: number, sale: number): string | null {
  if (!(original > sale) || !(original > 0) || !Number.isFinite(original) || !Number.isFinite(sale)) {
    return null;
  }
  const pct = Math.round((1 - sale / original) * 100);
  if (pct >= 1) return `${pct}% OFF`;
  return `Save ${formatCardPrice(original - sale)}`;
}

/** Convert a price value (number or string) to a display string in MVR, e.g. 12.5 → "12.50" */
export function toMVR(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/** Convert a decimal MVR amount to laar (integer cents), e.g. 12.50 → 1250 */
export function toCents(mvr: number | string): number {
  const num = typeof mvr === 'string' ? parseFloat(mvr) : mvr;
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}
