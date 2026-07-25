<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Staff auth rate-limit / OTP cache keys.
 *
 * Prefixed with the app environment so TEST and PRODUCTION (which often share
 * one Redis) do not lock each other out when probing the same phone/email.
 */
final class StaffAuthRateLimit
{
    public static function prefix(string $name): string
    {
        return app()->environment() . ':' . ltrim($name, ':');
    }

    public static function pinIp(string $identityKey, string $ip): string
    {
        return self::prefix('staff-pin:' . $identityKey . ':' . $ip);
    }

    public static function pinAccount(string $identityKey): string
    {
        return self::prefix('staff-pin-acct:' . $identityKey);
    }

    public static function posPasswordIp(string $identityKey, string $ip): string
    {
        return self::prefix('staff-pos-pwd:' . $identityKey . ':' . $ip);
    }

    public static function phoneLoginIp(string $identityKey, string $ip): string
    {
        return self::prefix('staff-phone-login:' . $identityKey . ':' . $ip);
    }

    public static function passwordResetRequest(string $identityKey): string
    {
        return self::prefix('staff-pwd-reset-req:' . $identityKey);
    }

    public static function passwordResetOtp(string $identityKey): string
    {
        return self::prefix('staff-pwd-reset:' . $identityKey);
    }

    public static function passwordResetOtpAttempts(string $identityKey): string
    {
        return self::prefix('staff-pwd-reset-attempts:' . $identityKey);
    }

    /**
     * Legacy (pre-env-prefix) keys — cleared during recovery so old locks lift.
     *
     * @return list<string>
     */
    public static function legacyKeysForIdentity(string $identityKey, ?string $ip = null): array
    {
        $keys = [
            'staff-pin-acct:' . $identityKey,
            'staff-pwd-reset-req:' . $identityKey,
            'staff-pwd-reset:' . $identityKey,
            'staff-pwd-reset-attempts:' . $identityKey,
        ];
        if ($ip !== null && $ip !== '') {
            $keys[] = 'staff-pin:' . $identityKey . ':' . $ip;
            $keys[] = 'staff-pos-pwd:' . $identityKey . ':' . $ip;
            $keys[] = 'staff-phone-login:' . $identityKey . ':' . $ip;
        }

        return $keys;
    }
}
