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

    /**
     * Whether a quantity in one unit can be expressed in another: the same
     * unit, or a conversion on file in either direction. convert() answers
     * an unknown pair with the quantity unchanged, which is right for two
     * spellings of the same thing and disastrous for grams against kilos;
     * callers that must not guess ask this first.
     */
    public function canConvert(?string $fromUnit, ?string $toUnit): bool
    {
        $from = $this->normalize($fromUnit);
        $to = $this->normalize($toUnit);
        if ($from === '' || $to === '' || $from === $to) {
            return true;
        }

        return $this->factor($from, $to) !== null;
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

    /**
     * Every unit on file that converts into $unit, with how many of $unit
     * one of it holds: for an item counted in g, kg => 1000 and mg => 0.001.
     * The buying screen offers these as ready-made packs, so "kg" on a line
     * for a gram-counted item needs no typing (owner, 2026-10-05: "unit
     * conversion is there but when i select kg every time i have to enter
     * the conversion").
     *
     * @return list<array{unit: string, base_units: float}>
     */
    public function conversionsTo(?string $unit): array
    {
        $to = $this->normalize($unit);
        if ($to === '') {
            return [];
        }
        $units = [];
        foreach ($this->factorMap() as $from => $row) {
            $units[$from] = true;
            foreach (array_keys($row) as $u) {
                $units[$u] = true;
            }
        }
        $out = [];
        foreach (array_keys($units) as $u) {
            if ($u === $to) {
                continue;
            }
            $f = $this->factor($u, $to);
            if ($f !== null && $f > 0) {
                $out[] = ['unit' => $u, 'base_units' => round($f, 6)];
            }
        }
        usort($out, fn ($a, $b) => strcmp($a['unit'], $b['unit']));

        return $out;
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
