<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\Item;
use App\Models\Recipe;
use App\Models\Variant;
use App\Services\UnitConversionService;

/**
 * How many portions the shared ingredient pool can still cover.
 *
 * Sizes of one dish are cut from one pool: 50 beetle leaves serve 50 fulls,
 * 100 halves, or any mix in between. Each variant draws on that pool at its
 * own rate (see Variant::consumptionFactor()), so "how many are left" has a
 * different answer per size and has to be asked per size.
 *
 * Owner, 2026-09-01, on what to do as the pool runs down: "Offer full until
 * the last possible piece." So nothing is held back for the smaller sizes — a
 * size is offered while the pool still covers that size's own requirement, and
 * full stays on the menu down to the final whole leaf. The half only outlives
 * the full because half a leaf is still a half portion, never because the full
 * was withdrawn early to protect it.
 *
 * Returns null — "the pool does not decide this" — unless the recipe opts in
 * via `limits_availability`. Ingredient counts that nobody keeps current would
 * otherwise take dishes off the menu on their own.
 */
class RecipeStockService
{
    public function __construct(
        private readonly UnitConversionService $unitConversions,
    ) {}

    /**
     * Portions of $variant (or of the plain item) the pool still covers.
     *
     * Null when the recipe does not cap availability, has no usable ingredient
     * line, or the variant draws nothing from the pool.
     */
    public function portionsAvailable(Item $item, ?Variant $variant = null): ?int
    {
        $recipe = $this->recipe($item);

        if (!$recipe || !$recipe->limits_availability) {
            return null;
        }

        $factor = $variant?->consumptionFactor() ?? 1.0;
        if ($factor <= 0) {
            return null;
        }

        $yieldQuantity = max(1.0, (float) $recipe->yield_quantity);
        $portions = null;

        foreach ($this->recipeItems($recipe) as $recipeItem) {
            $inventoryItem = $recipeItem->inventoryItem;
            if (!$inventoryItem || (float) $recipeItem->quantity <= 0) {
                continue;
            }

            $needed = $this->unitConversions->convert(
                ((float) $recipeItem->quantity * $factor) / $yieldQuantity,
                $recipeItem->unit ?: $inventoryItem->unit,
                $inventoryItem->unit,
            );
            if ($needed <= 0) {
                continue;
            }

            // Whole portions only — half an ingredient is not half a dish.
            $fromThisLine = (int) floor(max(0.0, (float) $inventoryItem->current_stock) / $needed);
            $portions = $portions === null ? $fromThisLine : min($portions, $fromThisLine);
        }

        return $portions;
    }

    /**
     * Portions left for the item as a whole — the best any active size can
     * still do, since the dish stays on the menu while one size is makeable.
     */
    public function portionsForItem(Item $item): ?int
    {
        $variants = $this->activeVariants($item);

        if ($variants === []) {
            return $this->portionsAvailable($item);
        }

        $best = null;
        foreach ($variants as $variant) {
            $portions = $this->portionsAvailable($item, $variant);
            if ($portions === null) {
                // A size that draws nothing from the pool can always be made,
                // so the pool cannot take this item off the menu.
                return null;
            }
            $best = $best === null ? $portions : max($best, $portions);
        }

        return $best;
    }

    /**
     * Per-variant portions for a menu feed, keyed by variant id. Empty when
     * the pool does not cap this item.
     *
     * @return array<int, int>
     */
    public function portionsByVariant(Item $item): array
    {
        $out = [];
        foreach ($this->activeVariants($item) as $variant) {
            $portions = $this->portionsAvailable($item, $variant);
            if ($portions !== null) {
                $out[(int) $variant->id] = $portions;
            }
        }

        return $out;
    }

    private function recipe(Item $item): ?Recipe
    {
        return $item->relationLoaded('recipe')
            ? $item->recipe
            : $item->recipe()->first();
    }

    /** @return iterable<\App\Models\RecipeItem> */
    private function recipeItems(Recipe $recipe): iterable
    {
        return $recipe->relationLoaded('recipeItems')
            ? $recipe->recipeItems
            : $recipe->recipeItems()->with('inventoryItem')->get();
    }

    /** @return list<Variant> */
    private function activeVariants(Item $item): array
    {
        if (!$item->has_variants) {
            return [];
        }

        $variants = $item->relationLoaded('variants')
            ? $item->variants
            : $item->variants()->get();

        return $variants->filter(fn (Variant $v) => (bool) $v->is_active)->values()->all();
    }
}
