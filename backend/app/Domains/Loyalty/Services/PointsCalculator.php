<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Services;

use App\Models\LoyaltyAccount;
use App\Models\Order;

/**
 * Calculates how many points a customer earns for an order,
 * and how much discount a given number of points translates to.
 *
 * Rates are configurable via env vars:
 *   LOYALTY_EARN_RATE  = points earned per MVR spent (default: 1)
 *   LOYALTY_REDEEM_RATE = how many points = 1 MVR (default: 100)
 */
class PointsCalculator
{
    public function earnRatePerMvr(): float
    {
        return (float) config('app.loyalty_earn_rate', 1);
    }

    public function redeemRatePerPoint(): float
    {
        return 1 / (float) config('app.loyalty_redeem_rate', 100);
    }

    /**
     * Calculate points to earn for an order.
     * Uses floor() — always round DOWN.
     * Applies tier multiplier from LoyaltyAccount.
     */
    public function pointsForOrder(Order $order, ?LoyaltyAccount $account = null): int
    {
        $amountMvr = $order->total ?? 0;
        $basePoints = (int) floor($amountMvr * $this->earnRatePerMvr());

        if ($account && config('app.loyalty_tiers_enabled', false)) {
            $multiplier = $this->tierMultiplier($account->tier);
            $basePoints = (int) floor($basePoints * $multiplier);
        }

        return max(0, $basePoints);
    }

    /**
     * Calculate discount in laari for a given number of points.
     * Uses floor() — always round DOWN.
     */
    public function discountLaarForPoints(int $points): int
    {
        $discountMvr = $points * $this->redeemRatePerPoint();

        return (int) floor($discountMvr * 100);
    }

    /**
     * Calculate how many points are needed to achieve a given discount.
     */
    public function pointsNeededForDiscountLaar(int $discountLaar): int
    {
        $discountMvr = $discountLaar / 100;

        return (int) ceil($discountMvr / $this->redeemRatePerPoint());
    }

    public function minRedeemPoints(): int
    {
        return (int) config('app.loyalty_min_redeem', 100);
    }

    public function maxRedeemPoints(): int
    {
        return (int) config('app.loyalty_max_redeem', 10000);
    }

    /**
     * Max percentage of order total that can be paid with points.
     */
    public function maxRedeemPercent(): float
    {
        return (float) config('app.loyalty_max_redeem_percent', 50);
    }

    private function tierMultiplier(string $tier): float
    {
        return match ($tier) {
            'silver' => 1.5,
            'gold' => 2.0,
            'platinum' => 3.0,
            default => 1.0,
        };
    }
}
