<?php

declare(strict_types=1);

namespace App\Support;

/**
 * MVR ↔ laari conversion helpers (1 MVR = 100 laari).
 *
 * Separate from App\Domains\Shared\ValueObjects\Money, which is a non-negative VO.
 * Use this for legacy decimal columns and discount paths that may be negative.
 */
final class Money
{
    public static function toLaar(string|int|float|null $mvr): int
    {
        if ($mvr === null) {
            return 0;
        }

        $decimal = self::normalizeDecimal($mvr);

        if ($decimal === '' || $decimal === '-' || $decimal === '+') {
            return 0;
        }

        if (extension_loaded('bcmath')) {
            $scaled = bcmul($decimal, '100', 2);

            return (int) (bccomp($scaled, '0', 2) >= 0
                ? bcadd($scaled, '0.5', 0)
                : bcsub($scaled, '0.5', 0));
        }

        return (int) round((float) $decimal * 100);
    }

    public static function toMvr(int $laar): float
    {
        if (extension_loaded('bcmath')) {
            return (float) bcdiv((string) $laar, '100', 2);
        }

        return $laar / 100;
    }

    private static function normalizeDecimal(string|int|float $mvr): string
    {
        if (is_int($mvr)) {
            return (string) $mvr;
        }

        if (is_float($mvr)) {
            return rtrim(rtrim(sprintf('%.14F', $mvr), '0'), '.');
        }

        return trim($mvr);
    }
}
