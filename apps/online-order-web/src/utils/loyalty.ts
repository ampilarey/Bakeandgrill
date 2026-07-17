import type { LoyaltyAccount, LoyaltyRates } from '@shared/types';

export type LoyaltyRatesConfig = {
  redeemRatePointsPerMvr: number;
  minRedeemPoints: number;
  maxRedeemPoints: number;
  maxRedeemPercent: number;
};

/** Match backend defaults when API rates are unavailable. */
export const DEFAULT_LOYALTY_RATES: LoyaltyRatesConfig = {
  redeemRatePointsPerMvr: 100,
  minRedeemPoints: 100,
  maxRedeemPoints: 10000,
  maxRedeemPercent: 50,
};

export function ratesFromApi(rates?: Partial<LoyaltyRates> | null): LoyaltyRatesConfig {
  if (!rates) return DEFAULT_LOYALTY_RATES;

  return {
    redeemRatePointsPerMvr: rates.redeem_rate_points_per_mvr ?? DEFAULT_LOYALTY_RATES.redeemRatePointsPerMvr,
    minRedeemPoints: rates.min_redeem_points ?? DEFAULT_LOYALTY_RATES.minRedeemPoints,
    maxRedeemPoints: rates.max_redeem_points ?? DEFAULT_LOYALTY_RATES.maxRedeemPoints,
    maxRedeemPercent: rates.max_redeem_percent ?? DEFAULT_LOYALTY_RATES.maxRedeemPercent,
  };
}

export function loyaltyAvailablePoints(account: LoyaltyAccount): number {
  if (typeof account.available_points === 'number') {
    return Math.max(0, account.available_points);
  }
  const held = account.points_held ?? 0;
  return Math.max(0, account.points_balance - held);
}

/** MVR string for a points balance, e.g. 516 → "5.16" */
export function pointsValueMvr(points: number, rates: LoyaltyRatesConfig = DEFAULT_LOYALTY_RATES): string {
  return (points / rates.redeemRatePointsPerMvr).toFixed(2);
}

/** Discount laar for redeeming points — mirrors PointsCalculator. */
export function discountLaarForRedeemPoints(points: number, rates: LoyaltyRatesConfig = DEFAULT_LOYALTY_RATES): number {
  return Math.floor((points / rates.redeemRatePointsPerMvr) * 100);
}

/**
 * Max points redeemable on this order before hitting available balance, percent cap, or max redeem.
 * `subtotalLaar` should be food subtotal after promo (laari).
 */
/**
 * Preview points earned on food subtotal (MVR).
 * Mirrors PointsCalculator: floor(mvr × rate) then floor(base × tierMultiplier).
 */
export function estimateEarnPointsForSubtotalMvr(
  subtotalMvr: number,
  earnRatePerMvr = 1,
  tierMultiplier = 1,
): number {
  if (subtotalMvr <= 0 || earnRatePerMvr <= 0) return 0;
  const base = Math.floor(subtotalMvr * earnRatePerMvr);
  if (tierMultiplier <= 1) return base;
  return Math.floor(base * tierMultiplier);
}

export function maxRedeemPointsForSubtotalLaar(
  subtotalLaar: number,
  availablePoints: number,
  rates: LoyaltyRatesConfig = DEFAULT_LOYALTY_RATES,
): number {
  if (availablePoints < rates.minRedeemPoints || subtotalLaar <= 0) {
    return 0;
  }

  const maxDiscountLaar = Math.floor(subtotalLaar * rates.maxRedeemPercent / 100);
  const capPointsFromPercent = Math.ceil((maxDiscountLaar / 100) * rates.redeemRatePointsPerMvr);

  return Math.min(availablePoints, capPointsFromPercent, rates.maxRedeemPoints);
}
