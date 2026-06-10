<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use App\Rules\MaldivesPhone;

final class StaffUserLookup
{
    /** @return list<string> */
    public static function usernameLookupValues(string $raw): array
    {
        $trimmed = trim($raw);
        $lower = strtolower($trimmed);
        $values = [$trimmed, $lower];

        try {
            $normalized = MaldivesPhone::normalize($trimmed);
            $values[] = $normalized;
            if (preg_match('/^\+960([0-9]{7})$/', $normalized, $matches)) {
                $values[] = $matches[1];
                $values[] = '960' . $matches[1];
            }
        } catch (\InvalidArgumentException) {
            // Not a Maldivian phone — email or other identifier.
        }

        return array_values(array_unique(array_filter($values, static fn (string $v) => $v !== '')));
    }

    public static function findByUsername(string $raw): ?User
    {
        $values = self::usernameLookupValues($raw);
        $localSeven = self::localSevenDigits($raw);

        return User::query()
            ->where(function ($query) use ($values, $localSeven) {
                foreach ($values as $value) {
                    $query->orWhere('phone', $value)
                        ->orWhere('email', $value);
                }
                if ($localSeven !== null) {
                    $query->orWhere('phone', 'like', '%' . $localSeven);
                }
            })
            ->first();
    }

    public static function findActiveByUsername(string $raw): ?User
    {
        $user = self::findByUsername($raw);

        return ($user !== null && $user->is_active) ? $user : null;
    }

    /** Last 7 local digits from a Maldivian phone input, if any. */
    public static function localSevenDigits(string $raw): ?string
    {
        $digits = preg_replace('/\D/', '', trim($raw)) ?? '';
        if (preg_match('/(?:^960)?([3679][0-9]{6})$/', $digits, $matches)) {
            return $matches[1];
        }

        return null;
    }

    public static function findActiveByPhone(string $raw): ?User
    {
        $values = self::usernameLookupValues($raw);

        return User::query()
            ->where('is_active', true)
            ->where(function ($query) use ($values) {
                foreach ($values as $value) {
                    $query->orWhere('phone', $value);
                }
            })
            ->first();
    }
}
