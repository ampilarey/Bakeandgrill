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

    public function test_gift_card_redeem_uses_raw_tender_amount(): void
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

        // Tender amount is not proportionally shrunk against merchandise discounts.
        $this->assertSame(8000, EffectiveDiscount::giftCardRedeemLaar($order));
        $this->assertSame(5000, EffectiveDiscount::remainingPreTaxBeforeGift($order));
    }

    public function test_discounted_subtotal_excludes_gift_card_tender(): void
    {
        $order = (object) [
            'subtotal_laar' => 25000,
            'promo_discount_laar' => 6000,
            'loyalty_discount_laar' => 0,
            'manual_discount_laar' => 0,
            'gift_card_discount_laar' => 10000,
            'referral_discount_laar' => 0,
        ];

        // Gift card must not reduce merchandise / fee / earn base.
        $this->assertSame(19000, EffectiveDiscount::discountedSubtotalLaarFromOrder($order));
    }

    public function test_merchandise_parts_zero_gift_card(): void
    {
        $order = (object) [
            'promo_discount_laar' => 100,
            'loyalty_discount_laar' => 200,
            'manual_discount_laar' => 0,
            'gift_card_discount_laar' => 9999,
            'referral_discount_laar' => 50,
        ];

        $parts = EffectiveDiscount::merchandisePartsFromOrder($order);
        $this->assertSame(0, $parts['gift_card']);
        $this->assertSame(100, $parts['promo']);
        $this->assertSame(50, $parts['referral']);
    }
}
