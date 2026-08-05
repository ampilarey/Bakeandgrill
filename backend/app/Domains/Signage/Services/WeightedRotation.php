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
