<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Services;

use App\Domains\Orders\Support\EffectiveDiscount;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use App\Services\LoyaltySettingsService;

/**
 * Calculates how many points a customer earns for an order,
 * and how much discount a given number of points translates to.
 */
class PointsCalculator
{
    public function __construct(
        private readonly LoyaltySettingsService $settings,
    ) {}

    public function earnRatePerMvr(): float
    {
        return $this->settings->earnRatePerMvr();
    }

    public function redeemRatePerPoint(): float
    {
        $rate = $this->settings->redeemRatePointsPerMvr();

        return $rate > 0 ? (1 / $rate) : (1 / 100);
    }

    /**
     * Calculate points to earn for an order.
     * Uses floor() — always round DOWN.
     * Applies tier multiplier when enabled.
     *
     * Earn base = discounted merchandise (subtotal after allocated promo/loyalty/
     * manual/gift/referral), matching free-delivery / fee thresholds. GST, service
     * charge, and packaging are excluded. Delivery fee is included only when
     * loyalty_earn_on_delivery_fee is enabled.
     */
    public function pointsForOrder(Order $order, ?LoyaltyAccount $account = null): int
    {
        if (!$this->settings->isProgramActive()) {
            return 0;
        }

        $foodLaar = EffectiveDiscount::discountedSubtotalLaarFromOrder($order);
        if ($this->settings->earnOnDeliveryFee()) {
            $foodLaar += max(0, (int) ($order->delivery_fee_laar ?? 0));
        }

        $amountMvr = max(0, $foodLaar) / 100;
        $basePoints = (int) floor($amountMvr * $this->earnRatePerMvr());

        if ($account && $this->settings->tiersEnabled()) {
            $multiplier = $this->settings->tierMultiplier($account->tier);
            $basePoints = (int) floor($basePoints * $multiplier);
        }

        return max(0, $basePoints);
    }

    public function discountLaarForPoints(int $points): int
    {
        $discountMvr = $points * $this->redeemRatePerPoint();

        return (int) floor($discountMvr * 100);
    }

    public function pointsNeededForDiscountLaar(int $discountLaar): int
    {
        $discountMvr = $discountLaar / 100;

        return (int) ceil($discountMvr / $this->redeemRatePerPoint());
    }

    public function minRedeemPoints(): int
    {
        return $this->settings->minRedeemPoints();
    }

    public function maxRedeemPoints(): int
    {
        return $this->settings->maxRedeemPoints();
    }

    public function maxRedeemPercent(): float
    {
        return $this->settings->maxRedeemPercent();
    }
}
