<?php

declare(strict_types=1);

namespace App\Domains\Content;

final class HomeSectionOrder
{
    public const DEFAULT = ['specials', 'featured', 'categories', 'proof', 'cta', 'location'];

    public const MOVABLE = self::DEFAULT;

    /**
     * Resolve stored section order, ignoring unknown IDs and appending any
     * sections missing from the stored order at the end, in default order.
     *
     * @return list<string>
     */
    public static function resolve(mixed $raw): array
    {
        $decoded = self::decode($raw);
        $known = array_flip(self::MOVABLE);
        $seen = [];
        $ordered = [];

        foreach ($decoded as $id) {
            if (! is_string($id) || ! isset($known[$id]) || isset($seen[$id])) {
                continue;
            }

            $seen[$id] = true;
            $ordered[] = $id;
        }

        foreach (self::DEFAULT as $id) {
            if (! isset($seen[$id])) {
                $ordered[] = $id;
            }
        }

        return $ordered;
    }

    public static function enableKeyFor(string $id): ?string
    {
        return match ($id) {
            'specials' => 'section_specials_enabled',
            'featured' => 'section_featured_enabled',
            'categories' => 'section_categories_enabled',
            'proof' => 'section_proof_enabled',
            'cta' => 'section_cta_enabled',
            'location' => 'section_location_enabled',
            default => null,
        };
    }

    /** @return list<mixed> */
    private static function decode(mixed $raw): array
    {
        if (is_array($raw)) {
            return array_is_list($raw) ? $raw : [];
        }

        if (! is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded) || ! array_is_list($decoded)) {
            return [];
        }

        return $decoded;
    }
}
