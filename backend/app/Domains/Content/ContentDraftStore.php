<?php

declare(strict_types=1);

namespace App\Domains\Content;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Short-lived draft overlays for staff preview (never public without token).
 */
final class ContentDraftStore
{
    public static function put(string $app, string $locale, array $overrides, int $ttlSeconds = 900): string
    {
        $token = Str::random(40);
        Cache::put(self::key($token), [
            'app' => $app,
            'locale' => $locale,
            'overrides' => $overrides,
            'user_id' => auth()->id(),
        ], $ttlSeconds);

        return $token;
    }

    /**
     * @return array{app: string, locale: string, overrides: array<string, string>, user_id: mixed}|null
     */
    public static function get(string $token): ?array
    {
        $data = Cache::get(self::key($token));

        return is_array($data) ? $data : null;
    }

    public static function forget(string $token): void
    {
        Cache::forget(self::key($token));
    }

    private static function key(string $token): string
    {
        return 'content_draft.' . $token;
    }
}
