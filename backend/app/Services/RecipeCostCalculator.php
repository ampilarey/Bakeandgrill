<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\Recipe;

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
        $sum = 0.0;
        $hasIngredients = false;

        foreach ($recipe->recipeItems as $row) {
            $hasIngredients = true;
            $unitCost = (float) ($row->inventoryItem?->unit_cost ?? 0);
            $sum += (float) $row->quantity * $unitCost;
        }

        if ($hasIngredients) {
            return round($sum, 2);
        }

        $stored = $recipe->total_cost !== null ? (float) $recipe->total_cost : 0.0;

        return $stored > 0 ? round($stored, 2) : null;
    }

    /** Manual cost field, else recipe roll-up. */
    public function effectiveCost(Item $item): ?float
    {
        if ($item->cost !== null && (float) $item->cost > 0) {
            return (float) $item->cost;
        }

        return $this->forItem($item);
    }
}
