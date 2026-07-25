<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class OrderLevelMarginFloorTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Catalog price 100, cost 80 → 10% floor ⇒ min unit 88 MVR ⇒ max disc 12 MVR = 1200 laari
        $this->seedCatalog(100.0, 80.0);
    }

    public function test_promo_plus_manual_cannot_breach_cost_floor(): void
    {
        Log::spy();
        SiteSetting::set('discount_margin_floor_enabled', 'true');
        SiteSetting::set('discount_margin_floor_pct', '10');

        $order = $this->buildPromoOrder(100.0);
        $breakdown = app(OrderTotalsCalculator::class)->calculate(
            $order,
            new DiscountsInput(
                promoDiscountLaar: 2000,
                manualDiscountLaar: 3000,
            ),
            taxRateBp: 0,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );

        // Max discountable = 10000 - 8800 = 1200
        $this->assertSame(1200, $breakdown->totalDiscount->amountLaar);
        $this->assertSame(8800, $breakdown->discountedSubtotal->amountLaar);
        $this->assertSame(
            1200,
            $breakdown->promoDiscount->amountLaar + $breakdown->manualDiscount->amountLaar,
        );
        Log::shouldHaveReceived('info')->withArgs(function ($message) {
            return is_string($message) && str_contains($message, 'margin floor');
        })->atLeast()->once();
    }

    public function test_gift_card_tender_excluded_from_clamp(): void
    {
        SiteSetting::set('discount_margin_floor_enabled', 'true');
        SiteSetting::set('discount_margin_floor_pct', '10');

        $order = $this->buildPromoOrder(100.0);
        $breakdown = app(OrderTotalsCalculator::class)->calculate(
            $order,
            new DiscountsInput(
                promoDiscountLaar: 2000,
                giftCardDiscountLaar: 5000, // tender — must not consume floor room
            ),
            taxRateBp: 0,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );

        $this->assertSame(1200, $breakdown->promoDiscount->amountLaar);
        $this->assertSame(5000, $breakdown->giftCardDiscount->amountLaar);
        // Merchandise clamped to 1200; gift card still allocated on top of subtotal cap later.
        // allocate() then caps total to subtotal: 1200 + 5000 = 6200 ≤ 10000 → both kept.
        $this->assertSame(6200, $breakdown->totalDiscount->amountLaar);
    }

    public function test_floor_off_leaves_totals_unchanged(): void
    {
        SiteSetting::set('discount_margin_floor_enabled', 'false');
        SiteSetting::set('discount_margin_floor_pct', '10');

        $order = $this->buildPromoOrder(100.0);
        $breakdown = app(OrderTotalsCalculator::class)->calculate(
            $order,
            new DiscountsInput(
                promoDiscountLaar: 2000,
                manualDiscountLaar: 3000,
            ),
            taxRateBp: 0,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );

        $this->assertSame(5000, $breakdown->totalDiscount->amountLaar);
        $this->assertSame(5000, $breakdown->discountedSubtotal->amountLaar);
    }
}
