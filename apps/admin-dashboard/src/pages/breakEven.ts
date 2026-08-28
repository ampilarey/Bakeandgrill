/**
 * The break-even arithmetic, mirroring the server's BreakEvenCalculator so the
 * page can recompute live as the owner edits the assumptions — without a
 * round-trip. The cases in breakEven.test.ts match BreakEvenCalculatorTest.php
 * line for line; if these two ever disagree, the number the owner tunes stops
 * matching the number the server would report.
 */

/**
 * Monthly sales needed to cover fixed costs at the given margin.
 * null when the margin is zero or negative — no volume breaks even, so a
 * target would be a lie.
 */
export function breakEvenRevenue(
  fixedCosts: number,
  contributionMarginRatio: number,
): number | null {
  if (contributionMarginRatio <= 0) return null;
  if (fixedCosts <= 0) return 0;
  return Math.round((fixedCosts / contributionMarginRatio) * 100) / 100;
}

/** Contribution-margin ratio from revenue and the variable cost of earning it. */
export function contributionMarginRatio(revenue: number, variableCost: number): number {
  if (revenue <= 0) return 0;
  return Math.round(((revenue - variableCost) / revenue) * 10000) / 10000;
}
