<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\Recipe;
use App\Models\Variant;

/**
 * Roll up ingredient unit costs into a menu item recipe cost (MVR).
 */
class RecipeCostCalculator
{
    public function forItem(Item $item): ?float
    {
        if (!$item->relationLoaded('recipe') || $item->recipe === null) {
            return null;
        }

        return $this->forRecipe($item->recipe);
    }

    public function forRecipe(Recipe $recipe): ?float
    {
        if (!$recipe->relationLoaded('recipeItems')) {
            $recipe->load('recipeItems.inventoryItem');
        }

        // Ingredient roll-up wins whenever the recipe has ingredients, so the
        // cost tracks the current price of what goes into the dish. The stored
        // total_cost is only a fallback for a recipe entered as a flat figure
        // with no ingredient rows.
        //
        // Precedence used to be the other way round, and a stored value that
        // pre-dated an ingredient price change silently kept winning — the
        // stale-cost finding in AUDIT_MONEY_PASS3. Recording an actual recipe
        // now overrides it with the live number.
        // Only the rows every size shares. A row that belongs to one size
        // is that size's cost, not the dish's — see effectiveCostForVariant.
        $sum = 0.0;
        $hasIngredients = false;

        foreach ($recipe->recipeItems as $row) {
            if ($row->variant_id !== null) {
                continue;
            }
            $hasIngredients = true;
            $unitCost = (float) ($row->inventoryItem?->unit_cost ?? 0);
            $sum += (float) $row->quantity * $unitCost;
        }

        if ($hasIngredients) {
            return round($sum, 2);
        }

        // A recipe made only of per-size rows has no cost as a whole; the
        // stored figure is not a fallback for that, it was typed for a
        // recipe with no rows at all.
        if ($recipe->recipeItems->isNotEmpty()) {
            return null;
        }

        $stored = $recipe->total_cost !== null ? (float) $recipe->total_cost : 0.0;

        return $stored > 0 ? round($stored, 2) : null;
    }

    /** What one size's own rows cost, on top of its share of the dish. */
    public function ownRowsCostForVariant(Recipe $recipe, Variant $variant): ?float
    {
        if (!$recipe->relationLoaded('recipeItems')) {
            $recipe->load('recipeItems.inventoryItem');
        }
        $own = $recipe->recipeItems->filter(fn ($r) => (int) $r->variant_id === (int) $variant->id);
        if ($own->isEmpty()) {
            return null;
        }
        $yield = max(1.0, (float) $recipe->yield_quantity);
        $sum = 0.0;
        foreach ($own as $row) {
            $sum += (float) $row->quantity * (float) ($row->inventoryItem?->unit_cost ?? 0) / $yield;
        }

        return round($sum, 2);
    }

    /** Manual cost field, else recipe roll-up, else a bundle's contents. */
    public function effectiveCost(Item $item): ?float
    {
        if ($item->cost !== null && (float) $item->cost > 0) {
            return (float) $item->cost;
        }

        $own = $this->forItem($item);
        if ($own !== null) {
            return $own;
        }

        return $this->bundleCost($item);
    }

    /**
     * What a fixed bundle costs to make: the sum of what its contents cost.
     *
     * Owner's audit, 2026-09-06 (F4): a bundle's cost came from the bundle's
     * own recipe and nowhere else. Unless somebody re-entered every child's
     * ingredients on the bundle itself, a bundle cost zero — so the margin
     * badge, the recipe editor's profit figures and the break-even calculator
     * all treated the lowest-margin thing on a menu as pure profit.
     *
     * Optional children are counted. Unlike the price, where a maybe should
     * not be charged for, a cost you might incur is a cost worth knowing:
     * costing a bundle as if nobody ever takes the optional side is the
     * optimistic direction, and this number exists to stop optimism.
     *
     * Null when nothing inside has a cost — an unknown cost must stay unknown
     * rather than become a confident zero. Platters are excluded: their
     * contents are chosen at order time, so there is no fixed cost to state.
     */
    public function bundleCost(Item $item, int $depth = 0): ?float
    {
        // Guard against a bundle that contains itself, directly or otherwise.
        if (!$item->is_combo || $depth > 5 || $item->isPlatter()) {
            return null;
        }

        $rows = $item->relationLoaded('comboItems')
            ? $item->comboItems
            : $item->comboItems()->with(['item.recipe.recipeItems.inventoryItem'])->get();

        $total = 0.0;
        $known = false;

        foreach ($rows as $row) {
            $child = $row->item;
            if ($child === null) {
                continue;
            }

            $childCost = $child->cost !== null && (float) $child->cost > 0
                ? (float) $child->cost
                : ($this->forItem($child) ?? $this->bundleCost($child, $depth + 1));

            if ($childCost === null) {
                continue;
            }

            $known = true;
            $total += $childCost * max(1, (int) $row->quantity);
        }

        return $known ? round($total, 2) : null;
    }

    /**
     * What one of a given size costs to make.
     *
     * A recipe hangs off the item, so a Half of a dish carries the same
     * ingredient list as a Full — its consumption factor is what says it uses
     * half of it. Costing every size at the whole recipe makes the smaller
     * ones look far less profitable than they are. A size with its own cost
     * recorded uses that and skips the arithmetic entirely.
     */
    public function effectiveCostForVariant(Item $item, ?Variant $variant): ?float
    {
        if ($variant === null) {
            return $this->effectiveCost($item);
        }

        if ($variant->cost !== null && (float) $variant->cost > 0) {
            return (float) $variant->cost;
        }

        // Its share of what every size uses, plus whatever is its alone
        // (owner, 2026-09-07: the 1.5L size's own bottle).
        $itemCost = $this->effectiveCost($item);
        $own = ($item->relationLoaded('recipe') ? $item->recipe : $item->recipe()->first())
            ? $this->ownRowsCostForVariant($item->relationLoaded('recipe') ? $item->recipe : $item->recipe()->first(), $variant)
            : null;

        if ($itemCost === null && $own === null) {
            return null;
        }

        return round(($itemCost ?? 0) * $variant->consumptionFactor() + ($own ?? 0), 2);
    }
}
