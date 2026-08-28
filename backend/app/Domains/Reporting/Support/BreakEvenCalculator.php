<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

/**
 * The break-even arithmetic, and nothing else.
 *
 * Standard contribution-margin model:
 *
 *   break-even revenue = fixed costs ÷ contribution-margin ratio
 *
 * where the contribution-margin ratio is the fraction of each rufiyaa of sales
 * left after the costs that scale with sales (food cost). That leftover is
 * what pays the fixed costs; once it covers them, you break even.
 *
 * Pure and static so it can be unit-tested without a database, and so the
 * admin UI can mirror it line for line for live what-if — the calculator is an
 * estimate the owner tunes, so the numbers have to move as they type without a
 * round-trip. `BreakEvenCalculatorTest` and the admin's `breakEven.test.ts`
 * pin the same cases on both sides.
 *
 * All money here is plain MVR (float). This is a projection, not a ledger
 * entry — laari precision would be false precision — so it deliberately does
 * not use the integer-laari money path the rest of the system does.
 */
final class BreakEvenCalculator
{
    /**
     * Monthly sales needed to cover fixed costs at the given margin.
     *
     * Returns null when the margin is zero or negative: every sale then loses
     * money before a rupee of rent is paid, so no volume breaks even and the
     * honest answer is "not reachable at this margin", not a huge or negative
     * number that looks like a target.
     */
    public static function breakEvenRevenue(float $fixedCosts, float $contributionMarginRatio): ?float
    {
        if ($contributionMarginRatio <= 0.0) {
            return null;
        }

        if ($fixedCosts <= 0.0) {
            return 0.0;
        }

        return round($fixedCosts / $contributionMarginRatio, 2);
    }

    /**
     * Contribution-margin ratio from revenue and the variable cost of earning
     * it. Both figures must be GST-exclusive or the ratio is overstated (see
     * AUDIT_FINANCE_2026-08-26.md F1).
     *
     * Zero when there is no revenue — an undefined ratio, reported as a flat
     * zero so callers do not divide by it.
     */
    public static function contributionMarginRatio(float $revenue, float $variableCost): float
    {
        if ($revenue <= 0.0) {
            return 0.0;
        }

        return round(($revenue - $variableCost) / $revenue, 4);
    }
}
