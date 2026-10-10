<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;

/**
 * Which channels a staff member's alerts go by (owner, 2026-10-07: "admin
 * decides in which channel notifications goes to a specific role or
 * person").
 *
 * Admin sets channels per role, and may give one person their own. An
 * alert reaches a person by a channel when:
 *  - the alert type has that channel on (SMS / Email / Telegram switches);
 *  - the person's channels include it (their own, else their role's);
 *  - the person can be reached that way (a phone, a saved email, a linked
 *    Telegram).
 *
 * Customers are not covered: their texts and emails follow the per-type
 * switches only. A person with no phone is addressed as "user:{id}"
 * (OwnerPhones), so phone-less staff get their email and Telegram too.
 */
final class NotificationChannels
{
    public const SMS = 'sms';
    public const EMAIL = 'email';
    public const TELEGRAM = 'telegram';

    /** @var list<string> */
    public const ALL = [self::SMS, self::EMAIL, self::TELEGRAM];

    public const SETTING_ROLES = 'notify_channels_roles';

    private const TOKEN_PREFIX = 'user:';

    /**
     * Channels per role, every role listed; a role never set gets all three
     * (what every alert did before this setting existed).
     *
     * @return array<string, list<string>>
     */
    public static function roles(): array
    {
        $saved = json_decode((string) SiteSetting::get(self::SETTING_ROLES, '{}'), true);
        $saved = is_array($saved) ? $saved : [];
        $out = [];
        // Owner first, then down the shop; any other role after, by name.
        $order = ['owner' => 0, 'manager' => 1, 'staff' => 2, 'kitchen_staff' => 3];
        $slugs = Role::query()->pluck('slug')->map(fn ($s) => (string) $s)
            ->sortBy(fn (string $s) => sprintf('%02d-%s', $order[$s] ?? 99, $s))->values();
        foreach ($slugs as $slug) {
            $out[(string) $slug] = isset($saved[$slug]) && is_array($saved[$slug]) ? self::clean($saved[$slug]) : self::ALL;
        }

        return $out;
    }

    /** @return list<string> */
    public static function forRole(?string $slug): array
    {
        return $slug !== null ? (self::roles()[$slug] ?? self::ALL) : self::ALL;
    }

    /** @return list<string> */
    public static function forUser(User $user): array
    {
        $own = $user->notify_channels;
        if (is_array($own)) {
            return self::clean($own);
        }
        $user->loadMissing('role');

        return self::forRole($user->role?->slug);
    }

    public static function allows(User $user, string $channel): bool
    {
        return in_array($channel, self::forUser($user), true);
    }

    /**
     * Whether a staff member with no phone can still be reached: a saved
     * email or a linked Telegram, on a channel their settings allow. Order
     * alerts go to such a person as "user:{id}" (owner, 2026-10-10); one
     * nothing can reach is left out rather than logged as a failure each time.
     */
    public static function reachableWithoutPhone(User $user): bool
    {
        $email = trim((string) $user->email);
        if (self::allows($user, self::EMAIL) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return true;
        }

        return self::allows($user, self::TELEGRAM)
            && app(\App\Domains\Telegram\Services\TelegramLinker::class)->linkForUser($user) !== null;
    }

    /** Where to address a staff member's alert: their phone, else "user:{id}" when another channel reaches them. */
    public static function addressFor(User $user): ?string
    {
        $phone = trim((string) $user->phone);
        if ($phone !== '') {
            return $phone;
        }

        return self::reachableWithoutPhone($user) ? self::token($user) : null;
    }

    /** @param array<string, list<string>> $roles */
    public static function setRoles(array $roles): void
    {
        $current = self::roles();
        foreach ($roles as $slug => $channels) {
            if (array_key_exists($slug, $current) && is_array($channels)) {
                $current[$slug] = self::clean($channels);
            }
        }
        SiteSetting::set(self::SETTING_ROLES, json_encode($current));
        SiteSetting::bust();
    }

    /** @param list<string>|null $channels null = follow the role */
    public static function setUser(User $user, ?array $channels): void
    {
        $user->forceFill(['notify_channels' => $channels === null ? null : self::clean($channels)])->save();
    }

    // ── Addressing people ────────────────────────────────────────────────

    public static function token(User $user): string
    {
        return self::TOKEN_PREFIX . $user->id;
    }

    public static function isToken(string $to): bool
    {
        return str_starts_with($to, self::TOKEN_PREFIX);
    }

    /**
     * The staff member an alert is addressed to: "user:{id}", or the active
     * staff account whose phone this is.
     */
    public static function personFor(string $to): ?User
    {
        if (self::isToken($to)) {
            return User::query()->with('role')->where('is_active', true)->find((int) substr($to, strlen(self::TOKEN_PREFIX)));
        }
        $local = substr(preg_replace('/\D/', '', $to) ?? '', -7);
        if (strlen($local) !== 7) {
            return null;
        }

        return User::query()->with('role')
            ->where('is_active', true)
            ->whereIn('phone', ['+960' . $local, '960' . $local, $local, '+960 ' . $local])
            ->orderBy('id')
            ->first();
    }

    /** @param array<mixed> $channels @return list<string> */
    private static function clean(array $channels): array
    {
        return array_values(array_filter(self::ALL, fn (string $c) => in_array($c, $channels, true)));
    }
}
