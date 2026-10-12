<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * One word of the ingredient glossary (2026-10-12): an English ingredient
 * and its Dhivehi, so a recipe's inventory names and a typed list print a
 * Dhivehi ingredients line (LabelIngredients). Matched on the lower-case
 * English (`word`); `en` keeps the owner's spelling.
 */
class LabelGlossaryEntry extends Model
{
    public const CACHE_KEY = 'label-glossary-map';

    protected $table = 'label_glossary';

    protected $fillable = ['en', 'word', 'dv'];

    protected static function booted(): void
    {
        static::saving(function (self $entry): void {
            $entry->en = trim((string) $entry->en);
            $entry->word = self::key($entry->en);
            $entry->dv = trim((string) $entry->dv);
        });
        static::saved(fn () => Cache::forget(self::CACHE_KEY));
        static::deleted(fn () => Cache::forget(self::CACHE_KEY));
    }

    /** The lower-case English a word is matched by: spaces squeezed, no trailing full stop. */
    public static function key(string $en): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', rtrim(trim($en), '.'))));
    }

    /**
     * Every word → its Dhivehi, cached: a sheet looks ingredients up many times.
     *
     * @return array<string, string>
     */
    public static function map(): array
    {
        try {
            return Cache::remember(self::CACHE_KEY, 3600, fn () => self::query()->pluck('dv', 'word')->all());
        } catch (\Throwable) {
            return self::query()->pluck('dv', 'word')->all();
        }
    }

    /** The Dhivehi for an English ingredient, trying the singular when the plural is not listed. */
    public static function lookup(string $en, ?array $map = null): ?string
    {
        $map ??= self::map();
        $key = self::key($en);
        if ($key === '') {
            return null;
        }
        foreach (self::variants($key) as $try) {
            if (isset($map[$try]) && $map[$try] !== '') {
                return $map[$try];
            }
        }

        return null;
    }

    /**
     * The spellings tried for a word: as is, without a plural ending, and
     * without a leading "fresh" / "dried" / "ground".
     *
     * @return list<string>
     */
    public static function variants(string $key): array
    {
        $tries = [$key];
        if (str_ends_with($key, 'ies')) {
            $tries[] = substr($key, 0, -3) . 'y';
        }
        if (str_ends_with($key, 'es')) {
            $tries[] = substr($key, 0, -2);
        }
        if (str_ends_with($key, 's')) {
            $tries[] = substr($key, 0, -1);
        }
        foreach (['fresh ', 'dried ', 'ground ', 'chopped ', 'grated ', 'sliced '] as $prefix) {
            if (str_starts_with($key, $prefix)) {
                $tries[] = substr($key, strlen($prefix));
            }
        }

        return array_values(array_unique($tries));
    }
}
