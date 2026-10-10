<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Who gets a "something needs you" text: every active owner and manager with
 * a phone on file, or the business phone when none has one. The reorder
 * alert, the price-rise alert and the complaint alerts all pick the same
 * people, so they pick them here.
 *
 * Since 2026-10-10 each alert has an audience the owner edits on its row in
 * Admin → Notifications (AlertAudience: roles, permission groups, named
 * people, exceptions, typed numbers and emails). `for($typeKey)` resolves it
 * and never returns nobody: an audience that resolves to no one falls back
 * to the owners, then the business phone, so an alert cannot go silent by
 * accident (off is the row's switches).
 *
 * A staff member with no phone is returned as "user:{id}" (2026-10-07):
 * SmsService sends them no SMS but their email and Telegram, by the
 * channels Admin chose for them (NotificationChannels). A typed email is
 * "email:{address}" and goes by email alone.
 */
final class OwnerPhones
{
    /** @return Collection<int, string> */
    public static function all(): Collection
    {
        return self::byRoles(['owner', 'manager']);
    }

    /**
     * Recipients for one SMS type, after the owner's choice in Admin →
     * Notifications. Types without an audience get owners and managers.
     *
     * @return Collection<int, string>
     */
    public static function for(string $typeKey): Collection
    {
        if (!AlertAudience::configurable($typeKey)) {
            return self::all();
        }
        $addresses = AlertAudience::addresses($typeKey);

        // An audience that resolves to nobody (staff without phones, an empty
        // business phone, everyone excepted) must not silence the alert.
        return $addresses->isEmpty() ? self::all() : $addresses;
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

    /**
     * Each person's phone, or "user:{id}" for one without.
     *
     * @param Collection<int, User> $users
     * @return Collection<int, string>
     */
    private static function addresses(Collection $users): Collection
    {
        return AlertAudience::unique($users
            ->map(fn (User $u) => trim((string) $u->phone) !== '' ? trim((string) $u->phone) : NotificationChannels::token($u)));
    }

    /**
     * For showing in Admin and the log: a "user:{id}" address as the person's
     * name, an "email:" address as the address.
     *
     * @param Collection<int, string> $addresses
     * @return list<string>
     */
    public static function describe(Collection $addresses): array
    {
        return $addresses->map(function (string $a): string {
            if (AlertAudience::isEmailAddress($a)) {
                return AlertAudience::emailFrom($a) . ' (email)';
            }
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
}
