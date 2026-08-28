import { describe, expect, it } from 'vitest';
import { breakEvenRevenue, contributionMarginRatio } from './breakEven';

/**
 * These are the same cases as backend BreakEvenCalculatorTest.php. The live
 * what-if in the UI must land on the number the server would report, or a
 * saved assumption would recompute differently than it previewed.
 */
describe('breakEven', () => {
  it('is fixed cost over margin', () => {
    expect(breakEvenRevenue(60000, 0.4)).toBe(150000);
  });

  it('has no break-even at a zero margin', () => {
    expect(breakEvenRevenue(60000, 0)).toBeNull();
  });

  it('has no break-even at a negative margin', () => {
    expect(breakEvenRevenue(60000, -0.1)).toBeNull();
  });

  it('breaks even at zero when there are no fixed costs', () => {
    expect(breakEvenRevenue(0, 0.4)).toBe(0);
  });

  it('computes the margin ratio as contribution over revenue', () => {
    expect(contributionMarginRatio(100000, 65000)).toBe(0.35);
  });

  it('is a zero ratio without revenue', () => {
    expect(contributionMarginRatio(0, 5000)).toBe(0);
  });

  it('goes negative when selling below cost, which then has no break-even', () => {
    const ratio = contributionMarginRatio(100000, 120000);
    expect(ratio).toBe(-0.2);
    expect(breakEvenRevenue(60000, ratio)).toBeNull();
  });
});
