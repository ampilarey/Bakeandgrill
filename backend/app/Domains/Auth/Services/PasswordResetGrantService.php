<?php

declare(strict_types=1);

namespace App\Domains\Auth\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Server-side, single-use, short-lived grant issued after a successful reset OTP
 * verification. The plaintext token is stored only in the customer session; the
 * cache holds the phone binding. Reset requires BOTH the session token and a
 * matching phone — session flash flags alone are never enough.
 */
class PasswordResetGrantService
{
    public const TTL_SECONDS = 600;

    private const CACHE_PREFIX = 'customer-password-reset-grant:';

    public function issue(string $phone): string
    {
        $token = bin2hex(random_bytes(32));

        Cache::put($this->cacheKey($token), [
            'phone' => $phone,
        ], self::TTL_SECONDS);

        return $token;
    }

    /**
     * Consume a grant if it is present, unexpired, and matches the phone.
     * On success the grant is deleted (single-use). Mismatched phones leave the
     * grant intact so a wrong-phone probe cannot burn a victim's grant.
     */
    public function consume(string $token, string $phone): bool
    {
        $key = $this->cacheKey($token);
        $payload = Cache::get($key);

        if (!is_array($payload)) {
            return false;
        }

        if (($payload['phone'] ?? null) !== $phone) {
            return false;
        }

        Cache::forget($key);

        return true;
    }

    private function cacheKey(string $token): string
    {
        return self::CACHE_PREFIX . $token;
    }
}
