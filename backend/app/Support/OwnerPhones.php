<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Who gets a "something needs you" text: every active owner and manager with
 * a phone on file, or the business phone when none has one. The reorder
 * alert, the price-rise alert and the complaint alerts all pick the same
 * people, so they pick them here.
 */
final class OwnerPhones
{
    /** @return Collection<int, string> */
    public static function all(): Collection
    {
        $phones = User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->whereIn('slug', ['owner', 'manager']))
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->pluck('phone')
            ->map(fn ($p) => trim((string) $p))
            ->filter()
            ->unique()
            ->values();

        if ($phones->isEmpty()) {
            $fallback = trim((string) SiteSetting::get('business_phone', ''));
            if ($fallback !== '') {
                $phones = collect([$fallback]);
            }
        }

        return $phones;
    }
}
