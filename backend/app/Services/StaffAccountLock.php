<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\User;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * A daily ceiling on wrong sign-ins for one staff account, whatever it is
 * signed in with (staff audit, 2026-10-01).
 *
 * The other limits are short and keyed on what was typed: eight tries per IP
 * every ten minutes, twenty per typed identity. They reset every ten minutes,
 * and the same account typed as its email and as its phone number counts
 * twice, so a four-digit PIN could be worked through in a few days and the
 * password logins had no account limit at all. Nobody was told.
 *
 * This one counts against the account itself for 24 hours. When it trips,
 * every way into the account is shut until the day passes or an owner resets
 * the PIN, and the owner gets a text.
 */
final class StaffAccountLock
{
    public const LIMIT = 30;

    private const DECAY_SECONDS = 86400;

    public function __construct(private readonly SmsService $sms) {}

    public static function key(int $userId): string
    {
        return StaffAuthRateLimit::prefix('staff-fail-user:' . $userId);
    }

    public function isLocked(User $user): bool
    {
        return RateLimiter::tooManyAttempts(self::key($user->id), self::LIMIT);
    }

    public function availableIn(User $user): int
    {
        return RateLimiter::availableIn(self::key($user->id));
    }

    public function recordFailure(User $user): void
    {
        $key = self::key($user->id);
        RateLimiter::hit($key, self::DECAY_SECONDS);

        if (RateLimiter::attempts($key) === self::LIMIT) {
            $this->alertOwner($user);
        }
    }

    public function clear(User $user): void
    {
        RateLimiter::clear(self::key($user->id));
    }

    private function alertOwner(User $user): void
    {
        $body = sprintf(
            "Bake & Grill: %s's staff sign-in is locked after %d wrong attempts in 24 hours. If that wasn't them, reset their PIN in Admin > Staff.",
            $user->name,
            self::LIMIT,
        );

        try {
            foreach (OwnerPhones::for('owner_staff_login_locked') as $phone) {
                $this->sms->send(new SmsMessage(
                    to: $phone,
                    message: $body,
                    type: 'owner_staff_login_locked',
                    referenceType: 'user',
                    referenceId: (string) $user->id,
                    idempotencyKey: 'staff-locked:' . $user->id . ':' . now()->toDateString() . ':' . $phone,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('staff.lock_alert_failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }
    }
}
