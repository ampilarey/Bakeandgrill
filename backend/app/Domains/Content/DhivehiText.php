<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * The website's built-in English in Dhivehi (iruali import plan, feature 3b).
 *
 * lang/dv.json maps English to Dhivehi, keyed by the English as written. Read
 * straight from the file, never through the translator's group lookup, so a
 * sentence with a dot in it is never mistaken for a lang/dv/<group>.php key.
 * English with no entry comes back unchanged.
 */
final class DhivehiText
{
    /** @var array<string, string>|null */
    private static ?array $map = null;

    public static function of(string $english): string
    {
        $dv = self::map()[$english] ?? '';

        return $dv !== '' ? $dv : $english;
    }

    /** @return array<string, string> */
    public static function map(): array
    {
        if (self::$map === null) {
            $path = lang_path('dv.json');
            $decoded = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            self::$map = is_array($decoded) ? array_filter($decoded, 'is_string') : [];
        }

        return self::$map;
    }
}
