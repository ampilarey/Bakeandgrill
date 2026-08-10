<?php

declare(strict_types=1);

namespace App\Domains\Shifts;

/**
 * Maldivian rufiyaa cash denominations for blind drawer counts.
 * All values are integer laari (1 MVR = 100 laari) — no float money math.
 */
final class CashDenominationCatalog
{
    /** @var list<int> */
    public const NOTES_LAARI = [100_000, 50_000, 10_000, 5_000, 2_000, 1_000, 500];

    /** @var list<int> */
    public const COMMON_COINS_LAARI = [200, 100, 50, 25];

    /** The Maldives mints 7 coins: MVR 2, MVR 1, 50, 25, 10, 5 and 1 laari. @var list<int> */
    public const RARE_COINS_LAARI = [10, 5, 1];

    public const METHOD_DENOMINATIONS = 'denominations';

    public const METHOD_PLAIN_TOTAL = 'plain_total';

    /** @return list<int> */
    public static function allLaari(): array
    {
        return array_merge(self::NOTES_LAARI, self::COMMON_COINS_LAARI, self::RARE_COINS_LAARI);
    }

    public static function isAllowed(int $laari): bool
    {
        return in_array($laari, self::allLaari(), true);
    }

    /**
     * Sum count × face value in laari. Missing / empty counts are zero.
     *
     * @param  array<int|string, int|string|null>  $countsByLaari  key = denomination laari
     */
    public static function totalLaariFromCounts(array $countsByLaari): int
    {
        $total = 0;
        foreach (self::allLaari() as $faceLaari) {
            $raw = $countsByLaari[$faceLaari] ?? $countsByLaari[(string) $faceLaari] ?? 0;
            if ($raw === null || $raw === '') {
                continue;
            }
            $count = (int) $raw;
            if ($count < 0) {
                $count = 0;
            }
            $total += $faceLaari * $count;
        }

        return $total;
    }

    /**
     * Normalize a client map into only allowed keys with non-negative int counts.
     * Empty / zero counts are omitted from the stored breakdown.
     *
     * @param  array<int|string, int|string|null>  $countsByLaari
     * @return array<string, int>  string keys for JSON stability
     */
    public static function normalizeBreakdown(array $countsByLaari): array
    {
        $out = [];
        foreach (self::allLaari() as $faceLaari) {
            $raw = $countsByLaari[$faceLaari] ?? $countsByLaari[(string) $faceLaari] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }
            $count = (int) $raw;
            if ($count <= 0) {
                continue;
            }
            $out[(string) $faceLaari] = $count;
        }

        return $out;
    }

    public static function labelForLaari(int $laari): string
    {
        if ($laari >= 100) {
            $mvr = intdiv($laari, 100);
            $rem = $laari % 100;
            if ($rem === 0) {
                return 'MVR '.$mvr;
            }
        }

        return match ($laari) {
            50 => '50 laari',
            25 => '25 laari',
            10 => '10 laari',
            5 => '5 laari',
            1 => '1 laari',
            // Historical breakdowns may hold retired faces (e.g. 20 / 2 laari).
            default => $laari.' laari',
        };
    }
}
