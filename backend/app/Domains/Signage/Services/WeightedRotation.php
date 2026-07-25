<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

/**
 * Deterministic weighted interleave — high-weight slides recur more often
 * without duplicating entries in the source playlist.
 */
final class WeightedRotation
{
    /**
     * @param  list<array<string, mixed>>  $slides
     * @return list<string> ordered slide ids for one rotation cycle
     */
    public static function buildOrder(array $slides): array
    {
        if ($slides === []) {
            return [];
        }

        $weights = [];
        foreach ($slides as $slide) {
            $id = (string) ($slide['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $weights[$id] = max(1, (int) ($slide['weight'] ?? 1));
        }
        if ($weights === []) {
            return [];
        }

        $max = max($weights);
        $order = [];
        for ($slot = 0; $slot < $max; $slot++) {
            foreach ($weights as $id => $w) {
                // Place slide when slot maps into its weight evenly across the cycle.
                if ((int) floor(($slot * $w) / $max) !== (int) floor((($slot - 1) * $w) / $max) || $slot === 0) {
                    if ($slot === 0 || ($slot % max(1, (int) floor($max / $w))) === 0) {
                        $order[] = $id;
                    }
                }
            }
        }

        // Fallback: ensure every slide appears at least once, then expand by weight.
        if ($order === []) {
            foreach (array_keys($weights) as $id) {
                $order[] = $id;
            }
        }

        // Cleaner deterministic approach: round-robin by remaining weight counters.
        return self::roundRobin($weights);
    }

    /**
     * @param  array<string, int>  $weights
     * @return list<string>
     */
    private static function roundRobin(array $weights): array
    {
        $remaining = $weights;
        $order = [];
        $guard = array_sum($weights) + count($weights);
        while ($guard-- > 0 && array_sum($remaining) > 0) {
            // Pick the slide with highest remaining weight; ties keep insertion order.
            $bestId = null;
            $bestW = -1;
            foreach ($remaining as $id => $w) {
                if ($w > $bestW) {
                    $bestW = $w;
                    $bestId = $id;
                }
            }
            if ($bestId === null || $bestW <= 0) {
                break;
            }
            $order[] = $bestId;
            $remaining[$bestId]--;
        }

        return $order;
    }
}
