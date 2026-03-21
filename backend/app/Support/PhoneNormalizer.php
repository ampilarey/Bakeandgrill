<?php

declare(strict_types=1);

namespace App\Support;

class PhoneNormalizer
{
    /**
     * Normalise a Maldivian phone number to +960XXXXXXX format.
     *
     * Accepts:
     *   - 7-digit local: 7654321        → +9607654321
     *   - With country code: 9607654321  → +9607654321
     *   - Already normalised: +9607654321 → +9607654321
     */
    public static function normalize(string $phone): string
    {
        $digitsOnly = preg_replace('/[^0-9]/', '', $phone);

        if (str_starts_with($digitsOnly, '960') && strlen($digitsOnly) === 10) {
            return '+' . $digitsOnly;
        }

        if (strlen($digitsOnly) === 7) {
            return '+960' . $digitsOnly;
        }

        return '+960' . substr($digitsOnly, -7);
    }
}
