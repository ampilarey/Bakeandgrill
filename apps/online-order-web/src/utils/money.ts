/** Convert laar (integer cents) to MVR decimal string, e.g. 1250 → "12.50" */
export function laarToMvr(laar: number): string {
  return (laar / 100).toFixed(2);
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
