<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;

/**
 * Captures ContentResolver output for every non-deprecated registry key × app × locale.
 * Used as the Stage 1–3 safety net for separating website / order_app from shared fallback.
 */
final class ContentResolverSnapshot
{
    /** 173 non-deprecated keys × 2 apps × 2 locales (updated when content.php grows). */
    public const EXPECTED_COMBINATIONS = 692;

    public static function fixturePath(): string
    {
        return dirname(__DIR__).'/Fixtures/content_resolver_separation_snapshot.json';
    }

    /**
     * @return list<string>
     */
    public static function nonDeprecatedKeys(): array
    {
        $keys = [];
        foreach (ContentRegistry::blocks() as $key => $block) {
            if (! empty($block['deprecated'])) {
                continue;
            }
            $keys[] = (string) $key;
        }
        sort($keys);

        return $keys;
    }

    /**
     * @return array{
     *   meta: array{key_count: int, apps: list<string>, locales: list<string>, combinations: int},
     *   values: array<string, array<string, array<string, mixed>>>
     * }
     */
    public static function capture(): array
    {
        $keys = self::nonDeprecatedKeys();
        $apps = ContentRegistry::APPS;
        $locales = ContentRegistry::LOCALES;
        $values = [];

        foreach ($apps as $app) {
            foreach ($locales as $locale) {
                $resolver = ContentResolver::for($app, $locale);
                foreach ($keys as $key) {
                    $values[$app][$locale][$key] = self::normalize($resolver->get($key));
                }
            }
        }

        return [
            'meta' => [
                'key_count' => count($keys),
                'apps' => array_values($apps),
                'locales' => array_values($locales),
                'combinations' => count($keys) * count($apps) * count($locales),
            ],
            'values' => $values,
        ];
    }

    /**
     * Normalize resolver output for stable JSON comparison.
     * Bools become "true"/"false" strings to match allPublic()-style storage.
     */
    public static function normalize(mixed $value): mixed
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        if (is_array($value) || is_object($value)) {
            return json_decode(
                json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'null',
                true,
            );
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $actual
     * @return list<string> human-readable diffs (empty if identical)
     */
    public static function diff(array $expected, array $actual): array
    {
        $diffs = [];
        $keys = self::nonDeprecatedKeys();
        foreach (ContentRegistry::APPS as $app) {
            foreach (ContentRegistry::LOCALES as $locale) {
                foreach ($keys as $key) {
                    $exp = $expected['values'][$app][$locale][$key] ?? null;
                    $act = $actual['values'][$app][$locale][$key] ?? null;
                    if ($exp !== $act) {
                        $diffs[] = sprintf(
                            '%s/%s/%s expected=%s actual=%s',
                            $app,
                            $locale,
                            $key,
                            self::preview($exp),
                            self::preview($act),
                        );
                    }
                }
            }
        }

        return $diffs;
    }

    private static function preview(mixed $value): string
    {
        $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($encoded)) {
            return '<unencodable>';
        }
        if (strlen($encoded) > 120) {
            return substr($encoded, 0, 117).'...';
        }

        return $encoded;
    }
}
