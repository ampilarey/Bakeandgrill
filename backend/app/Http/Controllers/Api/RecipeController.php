<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Services\RecipeCostCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Recipe recording and item costing.
 *
 * Everything here is gated by `recipes.manage` (owner-only by default): it
 * exposes what each dish costs to make, its margin and its profit, which is
 * not something every menu manager should see.
 */
class RecipeController extends Controller
{
    private const CSV_HEADER = ['item_id', 'item', 'category', 'size_id', 'size', 'ingredient_id', 'ingredient', 'quantity', 'unit'];

    public function __construct(private readonly RecipeCostCalculator $costs) {}

    /** GET /api/items/{id}/recipe — recipe + live cost / margin / profit. */
    public function show(int $id): JsonResponse
    {
        $item = Item::with(['recipe.recipeItems.inventoryItem', 'recipe.recipeItems.variant', 'variants'])->findOrFail($id);

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
        $item = Item::with(['recipe', 'variants'])->findOrFail($id);

        $data = $request->validate([
            'yield_quantity' => ['sometimes', 'numeric', 'min:0.001', 'max:100000'],
            'limits_availability' => ['sometimes', 'boolean'],
            // When the ingredients leave the store: when the dish is sold, or
            // when the kitchen records producing it (2026-09-07 audit).
            'consumed_at' => ['sometimes', 'string', 'in:sale,production'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'ingredients' => ['present', 'array', 'max:200'],
            'ingredients.*.inventory_item_id' => ['required', 'integer', 'exists:inventory_items,id'],
            'ingredients.*.quantity' => ['required', 'numeric', 'min:0', 'max:100000'],
            'ingredients.*.unit' => ['nullable', 'string', 'max:20'],
            // Null: every size shares the row. Set: one size's own row (owner,
            // 2026-09-07 — a 1.5L bottle for the 1.5L size only).
            'ingredients.*.variant_id' => ['nullable', 'integer'],
        ]);

        $ownVariantIds = $item->variants->pluck('id')->map(fn ($v) => (int) $v)->all();
        foreach ($data['ingredients'] as $i => $row) {
            $vid = $row['variant_id'] ?? null;
            if ($vid !== null && !in_array((int) $vid, $ownVariantIds, true)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "ingredients.{$i}.variant_id" => ['That size does not belong to this item.'],
                ]);
            }
        }

        $item = DB::transaction(fn () => $this->saveRecipe($item, $data));

        return response()->json(['item' => $this->payload($item)]);
    }

    /**
     * Replace the recipe of one item. Runs inside the caller's transaction so
     * a CSV import can save a hundred recipes or none.
     *
     * @param array<string, mixed> $data
     */
    private function saveRecipe(Item $item, array $data): Item
    {
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
        if (array_key_exists('consumed_at', $data)) {
            $recipe->consumed_at = $data['consumed_at'];
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
                'variant_id' => isset($row['variant_id']) && $row['variant_id'] !== null ? (int) $row['variant_id'] : null,
                'quantity' => (float) $row['quantity'],
                'unit' => $row['unit'] ?? null,
            ]);
        }

        // Refresh the snapshot from live ingredient prices so the column
        // and the live roll-up agree the moment the recipe is saved.
        $recipe->load('recipeItems.inventoryItem');
        // A recipe made only of per-size rows has no cost as a whole; the
        // column is NOT NULL, so store zero rather than fail the save.
        $recipe->total_cost = $this->costs->forRecipe($recipe) ?? 0.0;
        $recipe->save();

        return $item->load(['recipe.recipeItems.inventoryItem', 'recipe.recipeItems.variant', 'variants']);
    }

    /**
     * GET /api/recipes/export.csv — every active dish, one row per recipe
     * line; a dish with no recipe gets one blank row so it can be filled in
     * from a spreadsheet and imported back (owner, 2026-09-07).
     */
    public function exportCsv(): StreamedResponse
    {
        $items = Item::query()
            ->with(['category:id,name', 'recipe.recipeItems.inventoryItem:id,name,unit', 'recipe.recipeItems.variant:id,name', 'variants:id,item_id,name,sort_order,is_active'])
            ->where('is_active', true)
            ->orderBy('category_id')->orderBy('sort_order')->orderBy('name')
            ->get();

        return response()->streamDownload(function () use ($items) {
            $out = fopen('php://output', 'w');
            fputcsv($out, self::CSV_HEADER);
            foreach ($items as $item) {
                $rows = $item->recipe?->recipeItems ?? collect();
                if ($rows->isEmpty()) {
                    fputcsv($out, [$item->id, $item->name, $item->category?->name, '', '', '', '', '', '']);

                    continue;
                }
                foreach ($rows as $ri) {
                    fputcsv($out, [
                        $item->id,
                        $item->name,
                        $item->category?->name,
                        $ri->variant_id ?? '',
                        $ri->variant?->name ?? '',
                        $ri->inventory_item_id,
                        $ri->inventoryItem?->name ?? '',
                        rtrim(rtrim(number_format((float) $ri->quantity, 4, '.', ''), '0'), '.'),
                        $ri->unit ?? $ri->inventoryItem?->unit ?? '',
                    ]);
                }
            }
            fclose($out);
        }, 'recipes-' . now()->format('Y-m-d') . '.csv', ['Content-Type' => 'text/csv; charset=utf-8']);
    }

    /**
     * POST /api/recipes/import.csv — the export format back in.
     *
     * Every item that appears in the file gets its ingredient rows replaced
     * by the file's rows for it; items not in the file are untouched. A row
     * with a blank ingredient is "this dish has no lines" — so an item whose
     * only rows are blank ends up with an empty recipe. Ingredients and
     * sizes match by id first, then by name; anything unresolved is an
     * error, and one error means nothing is saved. `dry_run=1` reports what
     * would change without writing.
     */
    public function importCsv(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:5120'],
            'dry_run' => ['sometimes', 'boolean'],
        ]);
        $dryRun = $request->boolean('dry_run');

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $header = fgetcsv($handle);
        if (!is_array($header)) {
            fclose($handle);

            return response()->json(['message' => 'The file is empty.'], 422);
        }
        $header = array_map(fn ($h) => strtolower(trim((string) preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $header);
        $col = array_flip($header);
        foreach (['item_id', 'ingredient_id', 'quantity'] as $required) {
            if (!array_key_exists($required, $col) && !array_key_exists(str_replace('_id', '', $required), $col)) {
                fclose($handle);

                return response()->json(['message' => "The file needs a '{$required}' column — export the recipes first and edit that file."], 422);
            }
        }
        $cell = fn (array $row, string $key): string => array_key_exists($key, $col) ? trim((string) ($row[$col[$key]] ?? '')) : '';

        $items = Item::with('variants:id,item_id,name')->get()->keyBy('id');
        $itemsByName = $items->groupBy(fn ($i) => mb_strtolower(trim((string) $i->name)));
        $ingredients = InventoryItem::query()->get(['id', 'name', 'unit'])->keyBy('id');
        $ingredientsByName = $ingredients->groupBy(fn ($i) => mb_strtolower(trim((string) $i->name)));

        /** @var array<int, list<array{inventory_item_id:int, variant_id:?int, quantity:float, unit:?string}>> $perItem */
        $perItem = [];
        $errors = [];
        $line = 1;
        while (($row = fgetcsv($handle)) !== false) {
            $line++;
            if (count(array_filter($row, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }

            $item = $this->resolve($cell($row, 'item_id'), $cell($row, 'item'), $items, $itemsByName);
            if ($item === null) {
                $errors[] = "Line {$line}: no menu item matches '" . ($cell($row, 'item_id') ?: $cell($row, 'item')) . "'.";

                continue;
            }
            $perItem[$item->id] ??= [];

            $ingredientRef = $cell($row, 'ingredient_id') ?: $cell($row, 'ingredient');
            if ($ingredientRef === '') {
                continue; // blank line for a dish: keeps it in the file with no rows
            }
            $ingredient = $this->resolve($cell($row, 'ingredient_id'), $cell($row, 'ingredient'), $ingredients, $ingredientsByName);
            if ($ingredient === null) {
                $errors[] = "Line {$line}: no stock item matches '{$ingredientRef}'.";

                continue;
            }

            $variantId = null;
            $sizeRef = $cell($row, 'size_id') ?: $cell($row, 'size');
            if ($sizeRef !== '') {
                $variant = $item->variants->first(fn ($v) => (string) $v->id === $cell($row, 'size_id'))
                    ?? $item->variants->first(fn ($v) => mb_strtolower(trim((string) $v->name)) === mb_strtolower($cell($row, 'size')));
                if ($variant === null) {
                    $errors[] = "Line {$line}: '{$item->name}' has no size '{$sizeRef}'.";

                    continue;
                }
                $variantId = (int) $variant->id;
            }

            $qty = $cell($row, 'quantity');
            if ($qty === '' || !is_numeric($qty) || (float) $qty < 0) {
                $errors[] = "Line {$line}: quantity '{$qty}' is not a number.";

                continue;
            }

            $perItem[$item->id][] = [
                'inventory_item_id' => (int) $ingredient->id,
                'variant_id' => $variantId,
                'quantity' => (float) $qty,
                'unit' => $cell($row, 'unit') !== '' ? mb_substr($cell($row, 'unit'), 0, 20) : ($ingredient->unit ?? null),
            ];
        }
        fclose($handle);

        if ($errors !== []) {
            return response()->json([
                'message' => count($errors) . ' line' . (count($errors) === 1 ? '' : 's') . ' could not be read. Nothing was saved.',
                'errors' => $errors,
            ], 422);
        }

        $before = Recipe::query()->whereIn('item_id', array_keys($perItem))->withCount('recipeItems')->get()->keyBy('item_id');
        $changes = [];
        foreach ($perItem as $itemId => $rows) {
            $live = array_values(array_filter($rows, fn ($r) => $r['quantity'] > 0));
            $changes[] = [
                'item_id' => $itemId,
                'item' => $items[$itemId]->name,
                'rows_before' => (int) ($before[$itemId]->recipe_items_count ?? 0),
                'rows_after' => count($live),
            ];
        }

        if (!$dryRun) {
            DB::transaction(function () use ($perItem, $items) {
                foreach ($perItem as $itemId => $rows) {
                    $item = $items[$itemId]->load(['recipe', 'variants']);
                    $this->saveRecipe($item, ['ingredients' => $rows]);
                }
            });
        }

        return response()->json([
            'dry_run' => $dryRun,
            'items' => count($perItem),
            'rows' => array_sum(array_map(fn ($c) => $c['rows_after'], $changes)),
            'cleared' => count(array_filter($changes, fn ($c) => $c['rows_after'] === 0 && $c['rows_before'] > 0)),
            'changes' => $changes,
            'message' => $dryRun
                ? count($perItem) . ' dish' . (count($perItem) === 1 ? '' : 'es') . ' would be updated.'
                : count($perItem) . ' dish' . (count($perItem) === 1 ? '' : 'es') . ' updated.',
        ]);
    }

    /**
     * Find one row by id, else by an exact (case-insensitive) unique name.
     *
     * @template T of \Illuminate\Database\Eloquent\Model
     *
     * @param Collection<int, T> $byId
     * @param Collection<string, Collection<int, T>> $byName
     * @return T|null
     */
    private function resolve(string $id, string $name, Collection $byId, Collection $byName): mixed
    {
        if ($id !== '' && ctype_digit($id)) {
            return $byId->get((int) $id);
        }
        if ($name === '') {
            return null;
        }
        $matches = $byName->get(mb_strtolower($name));

        return $matches && $matches->count() === 1 ? $matches->first() : null;
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

        // Each size costed on its own: its share of the shared rows plus
        // what is its alone. The editor shows this table for a sized dish.
        $variants = $item->relationLoaded('variants') ? $item->variants : $item->variants()->get();
        $variantCosts = $variants->where('is_active', true)->sortBy('sort_order')->values()->map(function ($v) use ($item) {
            $vPrice = (float) ($v->price ?? 0);
            $vCost = $this->costs->effectiveCostForVariant($item, $v);

            return [
                'variant_id' => $v->id,
                'name' => $v->name,
                'price' => $vPrice,
                'consumption_factor' => $v->consumptionFactor(),
                'cost' => $vCost,
                'profit' => ($vCost !== null && $vPrice > 0) ? round($vPrice - $vCost, 2) : null,
                'margin_pct' => ($vCost !== null && $vPrice > 0) ? round(($vPrice - $vCost) / $vPrice * 100, 1) : null,
            ];
        })->all();

        return [
            'id' => $item->id,
            'name' => $item->name,
            'base_price' => $price,
            'recipe_cost' => $cost,
            'effective_cost' => $effectiveCost,
            'profit' => $profit,
            'margin_pct' => $marginPct,
            'variants' => $variants->where('is_active', true)->sortBy('sort_order')->values()->map(fn ($v) => [
                'id' => $v->id, 'name' => $v->name, 'consumption_factor' => $v->consumptionFactor(),
            ])->all(),
            'variant_costs' => $variantCosts,
            'recipe' => $item->recipe ? [
                'id' => $item->recipe->id,
                'yield_quantity' => (float) $item->recipe->yield_quantity,
                'limits_availability' => (bool) $item->recipe->limits_availability,
                'consumed_at' => (string) ($item->recipe->consumed_at ?? 'sale'),
                'instructions' => $item->recipe->instructions,
                'ingredients' => $item->recipe->recipeItems->map(fn ($ri) => [
                    'id' => $ri->id,
                    'inventory_item_id' => $ri->inventory_item_id,
                    'variant_id' => $ri->variant_id,
                    'variant' => $ri->variant ? ['id' => $ri->variant->id, 'name' => $ri->variant->name] : null,
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
