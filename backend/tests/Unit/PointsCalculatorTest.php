<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Loyalty\Services\PointsCalculator;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PointsCalculatorTest extends TestCase
{
    use RefreshDatabase;

    private PointsCalculator $calc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calc = app(PointsCalculator::class);
    }

    public function test_discount_for_100_points_default_rate(): void
    {
        // Default: 100 points = MVR 1.00 = 100 laari
        $this->assertEquals(100, $this->calc->discountLaarForPoints(100));
    }

    public function test_discount_for_points_uses_floor(): void
    {
        // 1 point = 0.01 MVR = 1 laari; 99 points = 0.99 MVR = 99 laari (floor)
        $this->assertEquals(99, $this->calc->discountLaarForPoints(99));
    }

    public function test_points_needed_for_discount(): void
    {
        // MVR 1.00 = 100 laari → 100 points
        $this->assertEquals(100, $this->calc->pointsNeededForDiscountLaar(100));
    }

    public function test_min_redeem_default(): void
    {
        $this->assertGreaterThan(0, $this->calc->minRedeemPoints());
    }

    public function test_preview_redemption_caps_by_max_percent_of_merchandise(): void
    {
        // 1000 points → MVR 10.00 = 1000 laari at default rate, but 50% of
        // MVR 10.00 merchandise (1000 laari) = 500 laari max.
        $preview = $this->calc->previewRedemption(1000, 5000, 1000);

        $this->assertSame(500, $preview['discount_laar']);
        $this->assertSame(500, $preview['points']);
    }

    public function test_earn_uses_discounted_merchandise_not_gross_total(): void
    {
        // Gross total includes GST; earn must use discounted food subtotal only.
        $order = Order::factory()->make([
            'subtotal' => 100.00,
            'subtotal_laar' => 10000,
            'tax_amount' => 8.00,
            'total' => 128.00,
            'total_laar' => 12800,
            'delivery_fee_laar' => 2000,
            'promo_discount_laar' => 2000,
        ]);

        // 100.00 − 20.00 promo = 80.00 → 80 points at 1 pt/MVR (delivery excluded)
        $this->assertSame(80, $this->calc->pointsForOrder($order));
    }

    public function test_earn_includes_delivery_when_setting_enabled(): void
    {
        SiteSetting::set('loyalty_earn_on_delivery_fee', '1');

        $order = Order::factory()->make([
            'subtotal' => 100.00,
            'subtotal_laar' => 10000,
            'total' => 120.00,
            'total_laar' => 12000,
            'delivery_fee_laar' => 2000,
            'promo_discount_laar' => 0,
        ]);

        // 100 food + 20 delivery = 120 points
        $this->assertSame(120, app(PointsCalculator::class)->pointsForOrder($order));
    }
}
