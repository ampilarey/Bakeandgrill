<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use App\Models\User;
use App\Rules\MaldivesPhone;
use Illuminate\Support\Collection;

/**
 * Who gets a "something needs you" text: every active owner and manager with
 * a phone on file, or the business phone when none has one. The reorder
 * alert, the price-rise alert and the complaint alerts all pick the same
 * people, so they pick them here.
 *
 * Since the SMS audit (2026-09-24) each owner-alert type can be pointed
 * elsewhere in the Control Center: owner only, the business phone, named
 * staff, or typed numbers. `for($typeKey)` honours that choice and falls
 * back to the type's default.
 *
 * A staff member with no phone is returned as "user:{id}" (2026-10-07):
 * SmsService sends them no SMS but their email and Telegram, by the
 * channels Admin chose for them (NotificationChannels).
 */
final class OwnerPhones
{
    /** @return Collection<int, string> */
    public static function all(): Collection
    {
        return self::byRoles(['owner', 'manager']);
    }

    /**
     * Recipients for one SMS type, after the owner's choice in the Control
     * Center. Types without a configurable recipient get the default.
     *
     * @return Collection<int, string>
     */
    public static function for(string $typeKey): Collection
    {
        $choice = SmsTypeRegistry::recipientOverride($typeKey);
        $mode = $choice['mode'] ?? SmsTypeRegistry::defaultRecipientMode($typeKey) ?? 'owners_managers';

        $phones = match ($mode) {
            'owner_only' => self::byRoles(['owner']),
            'business_phone' => self::businessPhone(),
            'staff' => self::byUserIds($choice['user_ids'] ?? []),
            'custom' => collect($choice['phones'] ?? [])
                ->map(fn (string $p) => self::normalize($p))
                ->filter()
                ->unique()
                ->values(),
            default => self::byRoles(['owner', 'manager']),
        };

        // A choice that resolves to nobody (staff without phones, an empty
        // business phone) must not silence the alert: fall back to owners.
        return $phones->isEmpty() ? self::all() : $phones;
    }

    /** @param list<string> $slugs @return Collection<int, string> */
    private static function byRoles(array $slugs): Collection
    {
        $phones = self::addresses(User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->whereIn('slug', $slugs))
            ->get(['id', 'phone']));

        return $phones->isEmpty() ? self::businessPhone() : $phones;
    }

    /** @param list<int> $ids @return Collection<int, string> */
    private static function byUserIds(array $ids): Collection
    {
        if ($ids === []) {
            return collect();
        }

        return self::addresses(User::query()
            ->whereIn('id', $ids)
            ->where('is_active', true)
            ->get(['id', 'phone']));
    }

    /**
     * Each person's phone, or "user:{id}" for one without.
     *
     * @param Collection<int, User> $users
     * @return Collection<int, string>
     */
    private static function addresses(Collection $users): Collection
    {
        return $users
            ->map(fn (User $u) => trim((string) $u->phone) !== '' ? trim((string) $u->phone) : NotificationChannels::token($u))
            ->unique()
            ->values();
    }

    /**
     * For showing in Admin: a "user:{id}" address as the person's name.
     *
     * @param Collection<int, string> $addresses
     * @return list<string>
     */
    public static function describe(Collection $addresses): array
    {
        return $addresses->map(function (string $a): string {
            if (!NotificationChannels::isToken($a)) {
                return $a;
            }
            $user = NotificationChannels::personFor($a);

            return $user !== null ? $user->name . ' (no phone: email / Telegram)' : $a;
        })->values()->all();
    }

    /** @return Collection<int, string> */
    private static function businessPhone(): Collection
    {
        $fallback = trim((string) SiteSetting::get('business_phone', ''));

        return $fallback !== '' ? collect([$fallback]) : collect();
    }

    private static function normalize(string $phone): ?string
    {
        try {
            return MaldivesPhone::normalize($phone);
        } catch (\Throwable) {
            return null;
        }
    }
}
