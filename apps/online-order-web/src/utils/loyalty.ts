import type { LoyaltyAccount } from '@shared/types';

/** Match backend defaults in config/app.php */
export const LOYALTY_MIN_REDEEM = 100;
export const LOYALTY_REDEEM_RATE = 100; // points per MVR 1
export const LOYALTY_MAX_REDEEM_PERCENT = 50;

export function loyaltyAvailablePoints(account: LoyaltyAccount): number {
  if (typeof account.available_points === 'number') {
    return Math.max(0, account.available_points);
  }
  const held = account.points_held ?? 0;
  return Math.max(0, account.points_balance - held);
}

/** MVR string for a points balance, e.g. 516 → "5.16" */
export function pointsValueMvr(points: number): string {
  return (points / LOYALTY_REDEEM_RATE).toFixed(2);
}

/** Discount laar for redeeming points — mirrors PointsCalculator at default rate. */
export function discountLaarForRedeemPoints(points: number): number {
  return Math.floor((points / LOYALTY_REDEEM_RATE) * 100);
}

/**
 * Max points redeemable on this order before hitting available balance or 50% cap.
 * `subtotalLaar` should be food subtotal after promo (laari).
 */
export function maxRedeemPointsForSubtotalLaar(subtotalLaar: number, availablePoints: number): number {
  if (availablePoints < LOYALTY_MIN_REDEEM || subtotalLaar <= 0) {
    return 0;
  }

  const maxDiscountLaar = Math.floor(subtotalLaar * LOYALTY_MAX_REDEEM_PERCENT / 100);
  const capPoints = Math.ceil((maxDiscountLaar / 100) * LOYALTY_REDEEM_RATE);

  return Math.min(availablePoints, capPoints);
}
