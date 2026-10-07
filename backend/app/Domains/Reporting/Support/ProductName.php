<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

/**
 * A size or other variant is its own product in every report (owner,
 * 2026-10-07: "In all other places also variant should treat as a separate
 * product"). Sales are grouped by item and variant, and named
 * "Water (Small)"; an item with no variant keeps its plain name.
 */
final class ProductName
{
    public static function label(?string $item, ?string $variant): string
    {
        $item = trim((string) $item);
        $variant = trim((string) $variant);

        return $variant === '' ? $item : $item . ' (' . $variant . ')';
    }

    /** A key unique per product, for lists keyed by it. */
    public static function key(int|string|null $itemId, int|string|null $variantId, ?string $variantName = null): string
    {
        return (int) $itemId . ':' . (int) $variantId . ':' . mb_strtolower(trim((string) $variantName));
    }
}
