<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\SiteSetting;

/**
 * When a stock write-down is big enough to need a reason.
 *
 * Stock audit, 2026-09-03 (S2, S5): a stock count set `current_stock` to
 * whatever was typed and a manual adjustment took any signed quantity, both
 * with the note optional. The cash count at close of shift is blind, valued,
 * and alerts on variance; stock is the same class of risk and had none of it.
 *
 * The threshold is in money, not units — a kilo of saffron and a kilo of rice
 * are not the same mistake.
 */
final class StockVariancePolicy
{
    public const DEFAULT_THRESHOLD_MVR = 500.0;

    public static function thresholdMvr(): float
    {
        $raw = SiteSetting::get('stock_variance_reason_mvr', (string) self::DEFAULT_THRESHOLD_MVR);
        $value = (float) $raw;
        if (!is_finite($value) || $value < 0) {
            return self::DEFAULT_THRESHOLD_MVR;
        }

        return $value;
    }

    /** What a difference of this many units is worth, always positive. */
    public static function varianceValueMvr(float $differenceUnits, ?float $unitCost): float
    {
        return round(abs($differenceUnits) * (float) ($unitCost ?? 0), 2);
    }

    /**
     * A reason is wanted once the variance is worth more than the threshold.
     * A threshold of 0 means always ask.
     */
    public static function needsReason(float $differenceUnits, ?float $unitCost): bool
    {
        return self::varianceValueMvr($differenceUnits, $unitCost) >= self::thresholdMvr()
            && abs($differenceUnits) > 0;
    }
}
