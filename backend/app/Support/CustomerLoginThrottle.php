<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\RateLimiter;

/**
 * Shared phone+IP and account-level throttling for customer password login
 * (API JSON and Blade web form).
 */
final class CustomerLoginThrottle
{
    public const PHONE_IP_MAX = 5;

    public const PHONE_IP_DECAY = 900; // 15 minutes

    public const ACCOUNT_MAX = 20;

    public const ACCOUNT_DECAY = 3600; // 1 hour

    public static function phoneIpKey(string $phone, string $ip): string
    {
        return 'customer-login:' . $phone . ':' . $ip;
    }

    public static function accountKey(string $phone): string
    {
        return 'customer-login-acct:' . $phone;
    }

    public static function tooManyAttempts(string $phone, string $ip): bool
    {
        return RateLimiter::tooManyAttempts(self::phoneIpKey($phone, $ip), self::PHONE_IP_MAX)
            || RateLimiter::tooManyAttempts(self::accountKey($phone), self::ACCOUNT_MAX);
    }

    public static function availableInSeconds(string $phone, string $ip): int
    {
        return max(
            RateLimiter::availableIn(self::phoneIpKey($phone, $ip)),
            RateLimiter::availableIn(self::accountKey($phone)),
        );
    }

    public static function hit(string $phone, string $ip): void
    {
        RateLimiter::hit(self::phoneIpKey($phone, $ip), self::PHONE_IP_DECAY);
        RateLimiter::hit(self::accountKey($phone), self::ACCOUNT_DECAY);
    }

    public static function clear(string $phone, string $ip): void
    {
        RateLimiter::clear(self::phoneIpKey($phone, $ip));
        RateLimiter::clear(self::accountKey($phone));
    }
}
