<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Audit, 2026-09-17: the unit conversion table was empty. A recipe row of
 * 200 g against flour stocked in kilos was taken out of stock as 200 kg and
 * costed as 200 kilos, because a pair with no conversion converts 1:1 and
 * nothing said so. The everyday metric pairs are on file from here; the
 * service reads either direction, so one row per pair is enough. Rows the
 * owner has already added are left alone.
 */
return new class extends Migration
{
    /** @var array<int, array{0: string, 1: string, 2: float}> */
    private const PAIRS = [
        ['g', 'kg', 0.001],
        ['mg', 'g', 0.001],
        ['mg', 'kg', 0.000001],
        ['ml', 'l', 0.001],
        ['cl', 'l', 0.01],
        ['cl', 'ml', 10.0],
    ];

    public function up(): void
    {
        $now = now();
        foreach (self::PAIRS as [$from, $to, $factor]) {
            $exists = DB::table('unit_conversions')
                ->where(fn ($q) => $q->where('from_unit', $from)->where('to_unit', $to))
                ->orWhere(fn ($q) => $q->where('from_unit', $to)->where('to_unit', $from))
                ->exists();
            if ($exists) {
                continue;
            }
            DB::table('unit_conversions')->insert([
                'from_unit' => $from,
                'to_unit' => $to,
                'factor' => $factor,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // The rows are indistinguishable from ones the owner would add; they stay.
    }
};
