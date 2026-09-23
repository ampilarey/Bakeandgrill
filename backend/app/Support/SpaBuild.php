<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Which build of a SPA the server is currently serving.
 *
 * Vite stamps a 12-hex build id into each app's `index.html`
 * (`<meta name="app-build">`, see `apps/online-order-web/vite.config.ts`).
 * A device that says which build it is running can then be compared with
 * what a fresh load would give it — which is how the TV board learns that
 * a deploy has happened and reloads itself, instead of showing last
 * month's bundle until somebody walks over with a remote.
 */
final class SpaBuild
{
    /** @var array<string, string|null> */
    private static array $memo = [];

    /** @var array<string, string|null> Test override, keyed by app. */
    private static array $fake = [];

    /**
     * The stamped build id, or null when the app is not built or the stamp
     * was never replaced (a dev checkout serves the literal placeholder).
     */
    public static function current(string $app): ?string
    {
        if (array_key_exists($app, self::$fake)) {
            return self::$fake[$app];
        }
        if (array_key_exists($app, self::$memo)) {
            return self::$memo[$app];
        }

        return self::$memo[$app] = self::read(public_path($app . '/index.html'));
    }

    public static function fake(string $app, ?string $build): void
    {
        self::$fake[$app] = $build;
    }

    public static function clearFake(): void
    {
        self::$fake = [];
        self::$memo = [];
    }

    public static function read(string $indexHtml): ?string
    {
        if (!is_file($indexHtml)) {
            return null;
        }
        $head = (string) file_get_contents($indexHtml, false, null, 0, 8192);
        if (preg_match('#<meta\s+name="app-build"\s+content="([0-9a-f]{6,64})"#i', $head, $m) !== 1) {
            return null;
        }

        return strtolower($m[1]);
    }
}
