/**
 * GST on the order-level fees: packaging, small-order, delivery.
 *
 * The client mirror of `OrderFeeTaxCalculator` on the server. Checkout has to
 * show the total the card will actually be charged, so the two have to round
 * the same way — integer laari, `Math.round`, one fee at a time.
 *
 * A delivery charge is a taxable supply in the Maldives and the small-order
 * fee is extra consideration for the same food, so both default to taxed. A
 * tip is not consideration for a supply and never appears here.
 */

export type FeeTaxFlags = {
  packaging?: boolean;
  smallOrder?: boolean;
  delivery?: boolean;
};

export type FeeLaar = {
  packagingLaar?: number;
  smallOrderLaar?: number;
  deliveryLaar?: number;
};

/** GST on a single fee, in laari. */
export function feeTaxLaar(
  feeLaar: number,
  taxable: boolean,
  taxRatePercent: number,
  taxInclusive: boolean,
): number {
  if (!taxable || feeLaar <= 0 || taxRatePercent <= 0) return 0;

  // Inclusive: the fee already contains its GST, so extract it. Exclusive: GST
  // rides on top of the fee.
  return taxInclusive
    ? Math.round((feeLaar * taxRatePercent) / (100 + taxRatePercent))
    : Math.round((feeLaar * taxRatePercent) / 100);
}

/**
 * Total GST across all three fees, in laari.
 *
 * Summed per fee rather than off a combined principal: the server rounds each
 * fee separately, and rounding a single total instead can land a laari away.
 */
export function orderFeeTaxLaar(
  fees: FeeLaar,
  flags: FeeTaxFlags,
  taxRatePercent: number,
  taxInclusive: boolean,
): number {
  return (
    feeTaxLaar(fees.packagingLaar ?? 0, flags.packaging !== false, taxRatePercent, taxInclusive) +
    feeTaxLaar(fees.smallOrderLaar ?? 0, flags.smallOrder !== false, taxRatePercent, taxInclusive) +
    feeTaxLaar(fees.deliveryLaar ?? 0, flags.delivery !== false, taxRatePercent, taxInclusive)
  );
}
