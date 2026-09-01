<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Item;
use App\Models\Recipe;
use App\Services\RecipeCostCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Recipe recording and item costing.
 *
 * Everything here is gated by `recipes.manage` (owner-only by default): it
 * exposes what each dish costs to make, its margin and its profit, which is
 * not something every menu manager should see.
 */
class RecipeController extends Controller
{
    public function __construct(private readonly RecipeCostCalculator $costs) {}

    /** GET /api/items/{id}/recipe — recipe + live cost / margin / profit. */
    public function show(int $id): JsonResponse
    {
        $item = Item::with('recipe.recipeItems.inventoryItem')->findOrFail($id);

        return response()->json(['item' => $this->payload($item)]);
    }

    /**
     * PUT /api/items/{id}/recipe — replace the ingredient list.
     *
     * Ingredients are replaced wholesale (delete + insert) inside a
     * transaction: a recipe is short, and diffing rows would only add a way to
     * half-save one. The stored total_cost is refreshed from live ingredient
     * prices on every save so a listing that reads the column is never stale.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $item = Item::with('recipe')->findOrFail($id);

        $data = $request->validate([
            'yield_quantity' => ['sometimes', 'numeric', 'min:0.001', 'max:100000'],
            'limits_availability' => ['sometimes', 'boolean'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'ingredients' => ['present', 'array', 'max:200'],
            'ingredients.*.inventory_item_id' => ['required', 'integer', 'exists:inventory_items,id'],
            'ingredients.*.quantity' => ['required', 'numeric', 'min:0', 'max:100000'],
            'ingredients.*.unit' => ['nullable', 'string', 'max:20'],
        ]);

        $item = DB::transaction(function () use ($item, $data) {
            $recipe = $item->recipe ?? Recipe::create([
                'item_id' => $item->id,
                'yield_quantity' => $data['yield_quantity'] ?? 1,
            ]);

            if (array_key_exists('yield_quantity', $data)) {
                $recipe->yield_quantity = $data['yield_quantity'];
            }
            // Opt-in: let the ingredient pool take the dish off the menu when
            // it runs out. Off by default — an ingredient count nobody keeps
            // current must not 86 an item on its own.
            if (array_key_exists('limits_availability', $data)) {
                $recipe->limits_availability = (bool) $data['limits_availability'];
            }
            if (array_key_exists('instructions', $data)) {
                $recipe->instructions = $data['instructions'];
            }

            $recipe->recipeItems()->delete();
            foreach ($data['ingredients'] as $row) {
                // Drop zero-quantity rows — an ingredient that contributes
                // nothing is noise, not a recipe line.
                if ((float) $row['quantity'] <= 0) {
                    continue;
                }
                $recipe->recipeItems()->create([
                    'inventory_item_id' => (int) $row['inventory_item_id'],
                    'quantity' => (float) $row['quantity'],
                    'unit' => $row['unit'] ?? null,
                ]);
            }

            // Refresh the snapshot from live ingredient prices so the column
            // and the live roll-up agree the moment the recipe is saved.
            $recipe->load('recipeItems.inventoryItem');
            $recipe->total_cost = $this->costs->forRecipe($recipe);
            $recipe->save();

            return $item->load('recipe.recipeItems.inventoryItem');
        });

        return response()->json(['item' => $this->payload($item)]);
    }

    /** @return array<string, mixed> */
    private function payload(Item $item): array
    {
        $cost = $item->recipe ? $this->costs->forRecipe($item->recipe) : null;
        $effectiveCost = $this->costs->effectiveCost($item);
        $price = (float) ($item->base_price ?? 0);

        // Profit uses the effective cost (recipe roll-up, else the item's own
        // cost field) so an item with a manual cost and no recipe still shows a
        // figure. Margin is the profit as a share of price.
        $basisCost = $effectiveCost;
        $profit = ($basisCost !== null && $price > 0) ? round($price - $basisCost, 2) : null;
        $marginPct = ($basisCost !== null && $price > 0)
            ? round(($price - $basisCost) / $price * 100, 1)
            : null;

        return [
            'id' => $item->id,
            'name' => $item->name,
            'base_price' => $price,
            'recipe_cost' => $cost,
            'effective_cost' => $effectiveCost,
            'profit' => $profit,
            'margin_pct' => $marginPct,
            'recipe' => $item->recipe ? [
                'id' => $item->recipe->id,
                'yield_quantity' => (float) $item->recipe->yield_quantity,
                'limits_availability' => (bool) $item->recipe->limits_availability,
                'instructions' => $item->recipe->instructions,
                'ingredients' => $item->recipe->recipeItems->map(fn ($ri) => [
                    'id' => $ri->id,
                    'inventory_item_id' => $ri->inventory_item_id,
                    'inventory_item' => $ri->inventoryItem ? [
                        'id' => $ri->inventoryItem->id,
                        'name' => $ri->inventoryItem->name,
                        'unit' => $ri->inventoryItem->unit,
                        'unit_cost' => (float) ($ri->inventoryItem->unit_cost ?? 0),
                    ] : null,
                    'quantity' => (float) $ri->quantity,
                    'unit' => $ri->unit,
                    'line_cost' => $ri->inventoryItem
                        ? round((float) $ri->quantity * (float) ($ri->inventoryItem->unit_cost ?? 0), 2)
                        : 0.0,
                ])->values(),
            ] : null,
        ];
    }
}
