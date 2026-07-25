<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\StaffAuthRateLimit;
use App\Services\StaffUserLookup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Redis;

/**
 * Clear staff login / OTP rate-limit locks (admin + POS).
 *
 * Use when a real owner is blocked by "Too many attempts" without having
 * failed many logins — often leftover Redis locks shared across envs/IPs.
 */
class ClearStaffLoginThrottleCommand extends Command
{
    protected $signature = 'staff:clear-login-throttle
        {username? : Phone or email to unlock (omit with --all)}
        {--all : Clear every staff-* login / OTP throttle key in Redis}
        {--ip= : Also clear IP-scoped keys for this client IP}';

    protected $description = 'Clear staff PIN/password/OTP login rate-limit locks';

    public function handle(): int
    {
        $all = (bool) $this->option('all');
        $username = $this->argument('username');
        $ip = $this->option('ip');

        if (!$all && ($username === null || trim((string) $username) === '')) {
            $this->error('Pass a phone/email, or use --all.');

            return 1;
        }

        if ($all) {
            $cleared = $this->clearByRedisPattern('*staff-pin*')
                + $this->clearByRedisPattern('*staff-pos-pwd*')
                + $this->clearByRedisPattern('*staff-phone-login*')
                + $this->clearByRedisPattern('*staff-pwd-reset*');
            $this->info("Cleared {$cleared} Redis key(s) matching staff login throttles.");

            return 0;
        }

        $identityKey = StaffUserLookup::canonicalIdentityKey((string) $username);
        $keys = [
            StaffAuthRateLimit::pinAccount($identityKey),
            StaffAuthRateLimit::passwordResetRequest($identityKey),
            StaffAuthRateLimit::passwordResetOtp($identityKey),
            StaffAuthRateLimit::passwordResetOtpAttempts($identityKey),
            ...StaffAuthRateLimit::legacyKeysForIdentity($identityKey, is_string($ip) ? $ip : null),
        ];

        if (is_string($ip) && $ip !== '') {
            $keys[] = StaffAuthRateLimit::pinIp($identityKey, $ip);
            $keys[] = StaffAuthRateLimit::posPasswordIp($identityKey, $ip);
            $keys[] = StaffAuthRateLimit::phoneLoginIp($identityKey, $ip);
        }

        foreach (array_unique($keys) as $key) {
            RateLimiter::clear($key);
            Cache::forget($key);
            Cache::forget($key . ':timer');
        }

        // Sweep any IP-scoped leftovers for this identity (unknown client IPs).
        $swept = $this->clearByRedisPattern('*' . $identityKey . '*');

        $this->info("Unlocked staff login for {$identityKey} (cleared " . count($keys) . " named keys, swept {$swept} Redis matches).");

        return 0;
    }

    private function clearByRedisPattern(string $pattern): int
    {
        try {
            $connection = (string) config('cache.stores.redis.connection', 'cache');
            $redis = Redis::connection($connection);
            $prefix = (string) config('cache.prefix', '');
            $fullPattern = $prefix . $pattern;
            $keys = $redis->keys($fullPattern);
            if (!is_array($keys) || $keys === []) {
                // Some Redis clients already apply the prefix — try bare pattern too.
                $keys = $redis->keys($pattern);
            }
            if (!is_array($keys) || $keys === []) {
                return 0;
            }
            foreach ($keys as $key) {
                $redis->del($key);
            }

            return count($keys);
        } catch (\Throwable $e) {
            $this->warn('Redis sweep skipped: ' . $e->getMessage());

            return 0;
        }
    }
}
