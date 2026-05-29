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
        $stored = $recipe->total_cost !== null ? (float) $recipe->total_cost : 0.0;
        if ($stored > 0) {
            return round($stored, 2);
        }

        if (!$recipe->relationLoaded('recipeItems')) {
            $recipe->load('recipeItems.inventoryItem');
        }

        $sum = 0.0;
        $hasIngredients = false;

        foreach ($recipe->recipeItems as $row) {
            $hasIngredients = true;
            $unitCost = (float) ($row->inventoryItem?->unit_cost ?? 0);
            $sum += (float) $row->quantity * $unitCost;
        }

        if (!$hasIngredients) {
            return null;
        }

        return round($sum, 2);
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
