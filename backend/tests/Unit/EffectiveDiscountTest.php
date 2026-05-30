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

    public function test_effective_total_is_capped_at_subtotal(): void
    {
        $this->assertSame(600, EffectiveDiscount::effectiveTotalLaar(600, [
            'promo' => 500,
            'loyalty' => 500,
            'manual' => 0,
            'gift_card' => 0,
            'referral' => 0,
        ]));
    }
}
