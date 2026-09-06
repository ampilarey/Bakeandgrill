<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Modifier;
use App\Models\OrderItemModifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Add-ons ("extra cheese", "no onions") and what each one uses.
 *
 * Menu-item stock audit, 2026-09-07 (finding 11): modifiers existed only as
 * seeded rows with a name and a price — nothing managed them, and nothing
 * about one ever touched stock. Now a modifier can name an ingredient and a
 * quantity per unit, and orders draw it like a recipe line.
 */
class ModifierController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = Modifier::query()
            ->with('inventoryItem:id,name,unit')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['modifiers' => $rows->map(fn (Modifier $m) => $this->format($m))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $modifier = Modifier::create($this->normalize($data));

        return response()->json(['modifier' => $this->format($modifier->load('inventoryItem:id,name,unit'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $modifier = Modifier::findOrFail($id);
        $data = $request->validate($this->rules(partial: true));
        $modifier->update($this->normalize($data));

        return response()->json(['modifier' => $this->format($modifier->fresh(['inventoryItem:id,name,unit']))]);
    }

    /**
     * One that has ever been on an order is switched off, not removed, so
     * old tickets still say what was on them.
     */
    public function destroy(int $id): JsonResponse
    {
        $modifier = Modifier::findOrFail($id);

        if (OrderItemModifier::where('modifier_id', $modifier->id)->exists()) {
            $modifier->update(['is_active' => false]);

            return response()->json(['message' => 'Modifier switched off — it stays on past orders.', 'deactivated' => true]);
        }

        $modifier->items()->detach();
        $modifier->delete();

        return response()->json(['message' => 'Modifier deleted.', 'deactivated' => false]);
    }

    /** @return array<string, mixed> */
    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name' => [$req, 'string', 'max:120'],
            'name_dv' => ['nullable', 'string', 'max:120'],
            'price' => ['nullable', 'numeric', 'min:0', 'max:99999'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'ingredient_quantity' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'ingredient_unit' => ['nullable', 'string', 'max:32'],
        ];
    }

    /** @param array<string, mixed> $data */
    private function normalize(array $data): array
    {
        // An ingredient without an amount, or an amount without an
        // ingredient, is nothing — store neither.
        $hasIngredient = !empty($data['inventory_item_id']) && (float) ($data['ingredient_quantity'] ?? 0) > 0;
        if (array_key_exists('inventory_item_id', $data) || array_key_exists('ingredient_quantity', $data)) {
            $data['inventory_item_id'] = $hasIngredient ? (int) $data['inventory_item_id'] : null;
            $data['ingredient_quantity'] = $hasIngredient ? (float) $data['ingredient_quantity'] : null;
            $data['ingredient_unit'] = $hasIngredient ? ($data['ingredient_unit'] ?? null) : null;
        }
        if (array_key_exists('price', $data)) {
            $data['price'] = round((float) ($data['price'] ?? 0), 2);
        }

        return $data;
    }

    private function format(Modifier $m): array
    {
        return [
            'id' => $m->id,
            'name' => $m->name,
            'name_dv' => $m->name_dv,
            'price' => (float) $m->price,
            'is_active' => (bool) $m->is_active,
            'sort_order' => (int) $m->sort_order,
            'inventory_item_id' => $m->inventory_item_id,
            'ingredient_quantity' => $m->ingredient_quantity !== null ? (float) $m->ingredient_quantity : null,
            'ingredient_unit' => $m->ingredient_unit,
            'inventory_item' => $m->inventoryItem ? [
                'id' => $m->inventoryItem->id,
                'name' => $m->inventoryItem->name,
                'unit' => $m->inventoryItem->unit,
            ] : null,
        ];
    }
}
