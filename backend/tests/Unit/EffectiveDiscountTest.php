<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Orders\Support\EffectiveDiscount;
use PHPUnit\Framework\TestCase;

class EffectiveDiscountTest extends TestCase
{
    public function test_allocate_scales_when_stacked_discounts_exceed_subtotal(): void
    {
        $allocated = EffectiveDiscount::allocate(600, [
            'promo' => 500,
            'loyalty' => 500,
            'manual' => 0,
            'gift_card' => 0,
            'referral' => 0,
        ]);

        $this->assertSame(600, array_sum($allocated));
        $this->assertSame(300, $allocated['promo']);
        $this->assertSame(300, $allocated['loyalty']);
    }

    public function test_gift_card_redeem_uses_allocated_share(): void
    {
        $order = (object) [
            'subtotal' => 100.0,
            'subtotal_laar' => 10000,
            'promo_discount_laar' => 5000,
            'loyalty_discount_laar' => 0,
            'manual_discount_laar' => 0,
            'gift_card_discount_laar' => 8000,
            'referral_discount_laar' => 0,
        ];

        // Proportional allocation: promo 5000 + gift 8000 on 10000 sub → gift share ≈ 6153 laar
        $this->assertSame(6153, EffectiveDiscount::giftCardRedeemLaar($order));
        $this->assertSame(5000, EffectiveDiscount::remainingPreTaxBeforeGift($order));
    }
}
