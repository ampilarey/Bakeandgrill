<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * Typed access to config/content.php — the Content Studio registry.
 */
final class ContentRegistry
{
    public const APPS = ['website', 'order_app'];

    public const SCOPES = ['shared', 'website', 'order_app'];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function blocks(): array
    {
        /** @var array<string, array<string, mixed>> $blocks */
        $blocks = config('content.blocks', []);

        return is_array($blocks) ? $blocks : [];
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::blocks());
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function block(string $key): ?array
    {
        $blocks = self::blocks();

        return $blocks[$key] ?? null;
    }

    public static function default(string $key): mixed
    {
        $block = self::block($key);

        return $block['default'] ?? null;
    }

    public static function isPublic(string $key): bool
    {
        $block = self::block($key);

        return (bool) ($block['public'] ?? false);
    }

    public static function isRich(string $key): bool
    {
        $block = self::block($key);

        return (bool) ($block['rich'] ?? false);
    }

    public static function isShareable(string $key): bool
    {
        $block = self::block($key);

        return (bool) ($block['shareable'] ?? false);
    }

    /**
     * @return list<string>
     */
    public static function appsFor(string $key): array
    {
        $block = self::block($key);
        $apps = $block['apps'] ?? [];

        return is_array($apps) ? array_values(array_map('strval', $apps)) : [];
    }

    public static function targetsApp(string $key, string $app): bool
    {
        return in_array($app, self::appsFor($key), true);
    }

    /**
     * @return list<string>
     */
    public static function publicKeys(): array
    {
        $keys = [];
        foreach (self::blocks() as $key => $block) {
            if (!empty($block['public'])) {
                $keys[] = (string) $key;
            }
        }

        return $keys;
    }

    /**
     * @return list<string>
     */
    public static function keysForApp(string $app): array
    {
        $keys = [];
        foreach (self::blocks() as $key => $block) {
            $apps = $block['apps'] ?? [];
            if (is_array($apps) && in_array($app, $apps, true)) {
                $keys[] = (string) $key;
            }
        }

        return $keys;
    }

    public static function validateRule(string $key): string
    {
        $block = self::block($key);

        return (string) ($block['validate'] ?? 'nullable|string');
    }

    public static function type(string $key): string
    {
        $block = self::block($key);

        return (string) ($block['type'] ?? 'text');
    }

    public static function label(string $key): string
    {
        $block = self::block($key);

        return (string) ($block['label'] ?? $key);
    }

    public static function group(string $key): string
    {
        $block = self::block($key);

        return (string) ($block['group'] ?? 'General');
    }
}
