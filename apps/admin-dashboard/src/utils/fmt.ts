/**
 * Safe number formatter — MySQL returns DECIMAL columns as strings.
 * Always parse before calling toFixed() to avoid "toFixed is not a function".
 */
export function n(val: unknown, fallback = 0): number {
  const parsed = parseFloat(String(val ?? fallback));
  return isNaN(parsed) ? fallback : parsed;
}

/** Format as fixed decimal string */
export function fmt(val: unknown, digits = 2): string {
  return n(val).toFixed(digits);
}

/** Format as MVR currency string */
export function mvr(val: unknown): string {
  return `MVR ${fmt(val, 2)}`;
}
