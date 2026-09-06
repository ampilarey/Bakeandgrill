<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\Variant;
use InvalidArgumentException;

/**
 * What may go inside a bundle or a platter, and in which size.
 *
 * Menu-item stock audit, 2026-09-07 (findings 6 and 15): a bundle could name
 * a sized dish with no size, and could nest a build-your-own platter whose
 * contents nobody could know. Both were accepted silently and neither could
 * move stock, print or price correctly.
 */
final class BundleChildRules
{
    /**
     * The size a child row is saved with.
     *
     * A dish sold in sizes must name one — "Coke" in a bundle is not a thing
     * the kitchen can hand over. A dish without sizes must not name one. A
     * build-your-own platter cannot be a child at all.
     *
     * @throws InvalidArgumentException with a message the editor can show
     */
    public static function resolveVariantId(int $itemId, mixed $variantId): ?int
    {
        $child = Item::query()->with('variants:id,item_id,name,is_active')->find($itemId);
        if ($child === null) {
            throw new InvalidArgumentException("Item {$itemId} does not exist.");
        }

        if ($child->is_combo && $child->isPlatter()) {
            throw new InvalidArgumentException(
                "\"{$child->name}\" is a build-your-own platter — it cannot go inside another bundle.",
            );
        }

        $wanted = $variantId !== null && $variantId !== '' ? (int) $variantId : null;

        if (!$child->has_variants) {
            return null;
        }

        $active = $child->variants->where('is_active', true);
        if ($wanted === null) {
            // One size only is no choice at all — take it.
            if ($active->count() === 1) {
                return (int) $active->first()->id;
            }
            throw new InvalidArgumentException(
                "\"{$child->name}\" comes in sizes — pick which size goes in.",
            );
        }

        $variant = $child->variants->firstWhere('id', $wanted);
        if ($variant === null) {
            throw new InvalidArgumentException(
                "That size does not belong to \"{$child->name}\".",
            );
        }

        return (int) $variant->id;
    }

    /** @return array{id: int, name: string, price: float}|null */
    public static function variantForApi(?Variant $variant): ?array
    {
        if ($variant === null) {
            return null;
        }

        return [
            'id' => (int) $variant->id,
            'name' => (string) $variant->name,
            'price' => (float) $variant->price,
        ];
    }

    /** "Coke (Large)" — the name a ticket or a menu prints for a sized child. */
    public static function displayName(Item $child, ?Variant $variant): string
    {
        return $variant ? "{$child->name} ({$variant->name})" : (string) $child->name;
    }
}
