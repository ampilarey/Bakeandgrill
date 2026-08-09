<?php

declare(strict_types=1);

namespace Tests\Unit\Shifts;

use App\Domains\Shifts\CashDenominationCatalog;
use PHPUnit\Framework\TestCase;

class CashDenominationCatalogTest extends TestCase
{
    public function test_counts_multiply_and_sum_in_laari_including_rare_and_fractional_coins(): void
    {
        // 3×500 + 7×100 + 4×50 + 2×0.50 + 1×0.25 + 1×0.01
        $total = CashDenominationCatalog::totalLaariFromCounts([
            50_000 => 3,
            10_000 => 7,
            5_000 => 4,
            50 => 2,
            25 => 1,
            1 => 1,
        ]);

        $this->assertSame(
            (3 * 50_000) + (7 * 10_000) + (4 * 5_000) + (2 * 50) + 25 + 1,
            $total
        );
        $this->assertSame(240_126, $total);
    }

    public function test_empty_and_missing_counts_are_zero(): void
    {
        $this->assertSame(0, CashDenominationCatalog::totalLaariFromCounts([]));
        $this->assertSame(
            100_000,
            CashDenominationCatalog::totalLaariFromCounts([
                100_000 => 1,
                50_000 => '',
                10_000 => null,
            ])
        );
    }

    public function test_normalize_omits_zeros_and_rejects_unknown_faces(): void
    {
        $normalized = CashDenominationCatalog::normalizeBreakdown([
            50_000 => 2,
            100_000 => 0,
            999 => 5,
            '25' => 3,
        ]);

        $this->assertSame(['50000' => 2, '25' => 3], $normalized);
    }
}
