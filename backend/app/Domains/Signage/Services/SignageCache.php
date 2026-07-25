<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use Illuminate\Support\Facades\Cache;

final class SignageCache
{
    public const VERSION_KEY = 'signage:playlist_version';

    public static function bust(): void
    {
        $v = (string) microtime(true);
        Cache::forever(self::VERSION_KEY, $v);
        // Resolved configs are keyed by screen + version; bumping version orphans old keys.
    }

    public static function version(): string
    {
        $v = Cache::get(self::VERSION_KEY);
        if (! is_string($v) || $v === '') {
            $v = (string) microtime(true);
            Cache::forever(self::VERSION_KEY, $v);
        }

        return sha1($v);
    }

    public static function remember(string $key, int $ttlSeconds, callable $cb): mixed
    {
        return Cache::remember($key, $ttlSeconds, $cb);
    }
}
