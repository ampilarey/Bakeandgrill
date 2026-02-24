<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Loyalty\Services\PointsCalculator;
use Tests\TestCase;

class PointsCalculatorTest extends TestCase
{
    private PointsCalculator $calc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calc = new PointsCalculator;
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
}
