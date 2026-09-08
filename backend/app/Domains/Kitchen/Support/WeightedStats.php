<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Support;

/**
 * The little arithmetic the production plan runs on. Kept apart so the
 * numbers can be checked without a database.
 */
final class WeightedStats
{
    /**
     * 1, 2, 3 … n: the newest observation counts n times as much as the
     * oldest. The same linear decay the revenue forecast has always used.
     *
     * @return list<float>
     */
    public static function linearWeights(int $n): array
    {
        $weights = [];
        for ($i = 1; $i <= $n; $i++) {
            $weights[] = (float) $i;
        }

        return $weights;
    }

    /**
     * @param list<float> $values
     * @param list<float>|null $weights
     */
    public static function mean(array $values, ?array $weights = null): float
    {
        $n = count($values);
        if ($n === 0) {
            return 0.0;
        }
        $weights ??= array_fill(0, $n, 1.0);
        $sum = 0.0;
        $wSum = 0.0;
        foreach ($values as $i => $v) {
            $w = $weights[$i] ?? 0.0;
            $sum += $v * $w;
            $wSum += $w;
        }

        return $wSum > 0 ? $sum / $wSum : 0.0;
    }

    /**
     * Weighted quantile with linear interpolation. `p` = 0.85 answers "a
     * figure that would have covered 85 of every 100 such days", giving
     * recent days more of a say than old ones.
     *
     * @param list<float> $values
     * @param list<float> $weights
     */
    public static function quantile(array $values, array $weights, float $p): float
    {
        $n = count($values);
        if ($n === 0) {
            return 0.0;
        }
        if ($n === 1) {
            return $values[0];
        }
        $p = max(0.0, min(1.0, $p));

        $pairs = [];
        foreach ($values as $i => $v) {
            $pairs[] = [$v, max(0.0, $weights[$i] ?? 0.0)];
        }
        usort($pairs, fn (array $a, array $b) => $a[0] <=> $b[0]);

        $total = array_sum(array_column($pairs, 1));
        if ($total <= 0) {
            return $pairs[(int) floor(($n - 1) * $p)][0];
        }

        // Each point sits at the middle of its own weight band.
        $positions = [];
        $cum = 0.0;
        foreach ($pairs as [$v, $w]) {
            $positions[] = ($cum + $w / 2) / $total;
            $cum += $w;
        }

        if ($p <= $positions[0]) {
            return $pairs[0][0];
        }
        if ($p >= $positions[$n - 1]) {
            return $pairs[$n - 1][0];
        }
        for ($i = 0; $i < $n - 1; $i++) {
            if ($p >= $positions[$i] && $p <= $positions[$i + 1]) {
                $span = $positions[$i + 1] - $positions[$i];
                $t = $span > 0 ? ($p - $positions[$i]) / $span : 0.0;

                return $pairs[$i][0] + $t * ($pairs[$i + 1][0] - $pairs[$i][0]);
            }
        }

        return $pairs[$n - 1][0];
    }

    /**
     * Pull an estimate from n observations towards a prior, as if the prior
     * were k observations of its own. Three holidays that each sold 30%
     * less do not yet prove holidays sell 30% less.
     */
    public static function shrink(float $observed, int $n, float $prior, int $k): float
    {
        if ($n <= 0) {
            return $prior;
        }

        return ($n * $observed + $k * $prior) / ($n + $k);
    }

    /** Round up to a multiple of `$step` (a tray of ten). */
    public static function ceilTo(float $value, int $step): float
    {
        if ($value <= 0) {
            return 0.0;
        }
        $step = max(1, $step);

        // Guard against 49.999999 becoming 50 → 60.
        return (float) (ceil(round($value, 6) / $step) * $step);
    }
}
