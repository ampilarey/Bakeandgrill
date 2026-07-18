<?php

declare(strict_types=1);

namespace App\Support;

use App\Rules\MaldivesPhone;

/**
 * Thin wrapper around {@see MaldivesPhone} so legacy call sites share one
 * strict Maldivian phone normalizer (no silent last-7 truncation).
 *
 * @throws \InvalidArgumentException when the number is not a valid MV mobile
 */
class PhoneNormalizer
{
    public static function normalize(string $phone): string
    {
        return MaldivesPhone::normalize($phone);
    }
}
