<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Reporting\Support\BreakEvenCalculator;
use PHPUnit\Framework\TestCase;

/**
 * The break-even arithmetic. These cases are mirrored in the admin's
 * breakEven.test.ts so the live what-if in the UI cannot drift from the server.
 */
class BreakEvenCalculatorTest extends TestCase
{
    public function test_break_even_is_fixed_cost_over_margin(): void
    {
        // MVR 60,000 of fixed cost at a 40% margin: every rufiyaa of sales
        // yields 0.40 toward fixed costs, so 60,000 / 0.40 = 150,000 of sales
        // breaks even.
        $this->assertSame(150000.0, BreakEvenCalculator::breakEvenRevenue(60000, 0.40));
    }

    public function test_a_zero_margin_has_no_break_even(): void
    {
        // Each sale exactly covers its own variable cost and no more, so no
        // volume ever pays the rent. Null, not infinity.
        $this->assertNull(BreakEvenCalculator::breakEvenRevenue(60000, 0.0));
    }

    public function test_a_negative_margin_has_no_break_even(): void
    {
        // Selling below variable cost: more sales lose more money. The honest
        // answer is "not reachable", never a positive-looking target.
        $this->assertNull(BreakEvenCalculator::breakEvenRevenue(60000, -0.10));
    }

    public function test_zero_fixed_cost_breaks_even_at_zero(): void
    {
        $this->assertSame(0.0, BreakEvenCalculator::breakEvenRevenue(0, 0.40));
    }

    public function test_margin_ratio_is_contribution_over_revenue(): void
    {
        // MVR 100k revenue, 65k variable cost → 35k contribution → 0.35.
        $this->assertSame(0.35, BreakEvenCalculator::contributionMarginRatio(100000, 65000));
    }

    public function test_margin_ratio_is_zero_without_revenue(): void
    {
        // Undefined; reported as a flat zero so callers never divide by it.
        $this->assertSame(0.0, BreakEvenCalculator::contributionMarginRatio(0, 5000));
    }

    public function test_margin_ratio_goes_negative_when_selling_below_cost(): void
    {
        // 100k revenue against 120k of variable cost → −0.20, which then makes
        // breakEvenRevenue return null. The two compose into an honest "you
        // cannot break even like this".
        $ratio = BreakEvenCalculator::contributionMarginRatio(100000, 120000);
        $this->assertSame(-0.20, $ratio);
        $this->assertNull(BreakEvenCalculator::breakEvenRevenue(60000, $ratio));
    }
}
