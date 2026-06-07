<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Domains\Orders\DTOs\DiscountsInput;

/**
 * Computes the discount actually taken off an order subtotal when
 * multiple discount fields may sum above the subtotal.
 */
final class EffectiveDiscount
{
    /**
     * @return array{promo: int, loyalty: int, manual: int, gift_card: int, referral: int}
     */
    public static function partsFromDiscountsInput(DiscountsInput $discounts): array
    {
        return [
            'promo' => $discounts->promoDiscountLaar,
            'loyalty' => $discounts->loyaltyDiscountLaar,
            'manual' => $discounts->manualDiscountLaar,
            'gift_card' => $discounts->giftCardDiscountLaar,
            'referral' => $discounts->referralDiscountLaar,
        ];
    }

    /**
     * @return array{promo: int, loyalty: int, manual: int, gift_card: int, referral: int}
     */
    public static function allocateFromInput(int $subtotalLaar, DiscountsInput $discounts): array
    {
        return self::allocate($subtotalLaar, self::partsFromDiscountsInput($discounts));
    }

    /**
     * @param array<string, int> $parts e.g. ['promo' => 500, 'loyalty' => 200]
     * @return array<string, int> Allocated laar per key (sums to effective total)
     */
    public static function allocate(int $subtotalLaar, array $parts): array
    {
        if ($subtotalLaar <= 0) {
            return array_map(fn () => 0, $parts);
        }

        $rawSum = array_sum($parts);
        if ($rawSum <= 0) {
            return array_map(fn () => 0, $parts);
        }

        if ($rawSum <= $subtotalLaar) {
            return $parts;
        }

        $scale = $subtotalLaar / $rawSum;
        $allocated = [];
        $running = 0;
        $keys = array_keys($parts);
        $lastKey = $keys[array_key_last($keys)];

        foreach ($parts as $key => $laar) {
            if ($key === $lastKey) {
                $allocated[$key] = max(0, $subtotalLaar - $running);

                continue;
            }
            $share = (int) floor($laar * $scale);
            $allocated[$key] = $share;
            $running += $share;
        }

        return $allocated;
    }

    public static function effectiveTotalLaar(int $subtotalLaar, array $parts): int
    {
        return min($subtotalLaar, max(0, array_sum($parts)));
    }

    /** Pre-tax subtotal still available before applying a gift card. */
    public static function remainingPreTaxBeforeGift(object $order): int
    {
        $sub = self::subtotalLaarFromOrder($order);
        $parts = self::partsFromOrder($order);
        $parts['gift_card'] = 0;

        return max(0, $sub - self::effectiveTotalLaar($sub, $parts));
    }

    /** Gift-card laar to debit at redemption (allocated share, not raw field). */
    public static function giftCardRedeemLaar(object $order): int
    {
        $parts = self::partsFromOrder($order);
        if (($parts['gift_card'] ?? 0) <= 0) {
            return 0;
        }

        $sub = self::subtotalLaarFromOrder($order);

        return self::allocate($sub, $parts)['gift_card'];
    }

    /**
     * @return array{promo: int, loyalty: int, manual: int, gift_card: int, referral: int}
     */
    public static function partsFromOrder(object $order): array
    {
        return [
            'promo' => (int) ($order->promo_discount_laar ?? 0),
            'loyalty' => (int) ($order->loyalty_discount_laar ?? 0),
            'manual' => (int) ($order->manual_discount_laar ?? 0),
            'gift_card' => (int) ($order->gift_card_discount_laar ?? 0),
            'referral' => (int) ($order->referral_discount_laar ?? 0),
        ];
    }

    public static function subtotalLaarFromOrder(object $order): int
    {
        if (isset($order->subtotal_laar) && $order->subtotal_laar !== null) {
            return (int) $order->subtotal_laar;
        }

        return (int) round((float) ($order->subtotal ?? 0) * 100);
    }
}
