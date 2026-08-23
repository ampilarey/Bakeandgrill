import { describe, expect, it } from 'vitest';
import { feeTaxLaar, orderFeeTaxLaar } from './feeTax';

/**
 * These numbers are the server's. Every expectation here also appears in
 * backend/tests/Feature/Orders/FeeGstTest.php, computed by
 * OrderFeeTaxCalculator — if the two ever disagree, checkout shows a total
 * that is not what the card gets charged.
 */
describe('feeTaxLaar', () => {
  it('adds GST on top of an exclusive fee', () => {
    // MVR 30 delivery at 8% → 2.40 GST.
    expect(feeTaxLaar(3000, true, 8, false)).toBe(240);
  });

  it('extracts GST already inside an inclusive fee', () => {
    // 8/108 of MVR 30 → 2.22, and the customer still pays 30.
    expect(feeTaxLaar(3000, true, 8, true)).toBe(222);
  });

  it('charges nothing when the fee is switched to not taxable', () => {
    expect(feeTaxLaar(3000, false, 8, false)).toBe(0);
  });

  it('charges nothing on a zero fee or a zero rate', () => {
    expect(feeTaxLaar(0, true, 8, false)).toBe(0);
    expect(feeTaxLaar(3000, true, 0, false)).toBe(0);
  });
});

describe('orderFeeTaxLaar', () => {
  it('sums the three fees', () => {
    // MVR 30 delivery + MVR 10 small-order + MVR 5 packaging at 8% exclusive.
    expect(
      orderFeeTaxLaar(
        { packagingLaar: 500, smallOrderLaar: 1000, deliveryLaar: 3000 },
        {},
        8,
        false,
      ),
    ).toBe(40 + 80 + 240);
  });

  it('rounds each fee separately, as the server does', () => {
    // Three fees of 19 laari: 1.52 laari of tax each, rounding to 2 → 6.
    // Rounding the combined 57 laari principal instead gives 5, and the
    // client total would sit a laari under the server's.
    expect(
      orderFeeTaxLaar(
        { packagingLaar: 19, smallOrderLaar: 19, deliveryLaar: 19 },
        {},
        8,
        false,
      ),
    ).toBe(6);
    expect(feeTaxLaar(57, true, 8, false)).toBe(5);
  });

  it('honours each switch independently', () => {
    expect(
      orderFeeTaxLaar(
        { packagingLaar: 500, smallOrderLaar: 1000, deliveryLaar: 3000 },
        { delivery: false },
        8,
        false,
      ),
    ).toBe(40 + 80);
  });

  it('defaults every fee to taxable when no flag is given', () => {
    // Matches the server default. A missing flag must never mean "untaxed" —
    // that is the failure this whole change exists to fix.
    expect(orderFeeTaxLaar({ deliveryLaar: 3000 }, {}, 8, false)).toBe(240);
  });
});
