<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\UnitConversion;
use Illuminate\Support\Facades\Cache;

/**
 * Converts quantities between units using configured unit_conversions rows.
 * Looks up direct factor, then reverse (1/factor). Falls back to 1.0 when
 * units match or no conversion exists (caller should treat that as same-unit).
 */
final class UnitConversionService
{
    public function convert(float $quantity, ?string $fromUnit, ?string $toUnit): float
    {
        $from = $this->normalize($fromUnit);
        $to = $this->normalize($toUnit);

        if ($quantity === 0.0 || $from === '' || $to === '' || $from === $to) {
            return $quantity;
        }

        $factor = $this->factor($from, $to);
        if ($factor === null) {
            return $quantity;
        }

        return round($quantity * $factor, 6);
    }

    public function factor(string $fromUnit, string $toUnit): ?float
    {
        $from = $this->normalize($fromUnit);
        $to = $this->normalize($toUnit);
        if ($from === '' || $to === '' || $from === $to) {
            return 1.0;
        }

        $map = $this->factorMap();
        $direct = $map[$from][$to] ?? null;
        if ($direct !== null) {
            return $direct;
        }

        $reverse = $map[$to][$from] ?? null;
        if ($reverse !== null && $reverse != 0.0) {
            return 1.0 / $reverse;
        }

        return null;
    }

    /** @return array<string, array<string, float>> */
    private function factorMap(): array
    {
        return Cache::remember('unit_conversion_factors_v1', 300, function () {
            $map = [];
            foreach (UnitConversion::query()->get(['from_unit', 'to_unit', 'factor']) as $row) {
                $from = $this->normalize((string) $row->from_unit);
                $to = $this->normalize((string) $row->to_unit);
                $factor = (float) $row->factor;
                if ($from === '' || $to === '' || $factor <= 0) {
                    continue;
                }
                $map[$from][$to] = $factor;
            }

            return $map;
        });
    }

    public function bustCache(): void
    {
        Cache::forget('unit_conversion_factors_v1');
    }

    private function normalize(?string $unit): string
    {
        return strtolower(trim((string) $unit));
    }
}
