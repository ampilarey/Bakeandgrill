<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Variant;
use App\Rules\UniqueScanCode;
use App\Services\VariantSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VariantController extends Controller
{
    public function __construct(private readonly VariantSyncService $syncService) {}

    /** GET /items/{itemId}/variants — list all variants for an item (admin). */
    public function index(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);

        return response()->json([
            'variants' => $item->variants()
                ->orderBy('sort_order')
                ->get()
                ->map(fn (Variant $v) => $this->formatVariant($v)),
        ]);
    }

    /** POST /items/{itemId}/variants — create a variant. */
    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'name_dv' => 'nullable|string|max:100',
            'price' => 'required|numeric|min:0',
            'cost' => 'nullable|numeric|min:0',
            'sku' => ['nullable', 'string', 'max:100', new UniqueScanCode],
            'barcode' => ['nullable', 'string', 'max:100', new UniqueScanCode],
            'track_stock' => 'nullable|boolean',
            'stock_qty' => 'nullable|integer|min:0',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'consumption_factor' => 'nullable|numeric|min:0|max:1000',
            'is_active' => 'nullable|boolean',
            'is_available' => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        $variant = $item->variants()->create([
            'name' => $data['name'],
            'name_dv' => $data['name_dv'] ?? null,
            'price' => $data['price'],
            'cost' => $data['cost'] ?? null,
            'sku' => $data['sku'] ?? null,
            'barcode' => $data['barcode'] ?? null,
            'track_stock' => (bool) ($data['track_stock'] ?? false),
            'stock_qty' => (int) ($data['stock_qty'] ?? 0),
            'low_stock_threshold' => (int) ($data['low_stock_threshold'] ?? 5),
            'consumption_factor' => max(0.0, (float) ($data['consumption_factor'] ?? 1.0)),
            'is_active' => isset($data['is_active']) ? (bool) $data['is_active'] : true,
            'is_available' => isset($data['is_available']) ? (bool) $data['is_available'] : true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['variant' => $this->formatVariant($variant)], 201);
    }

    /** PATCH /items/{itemId}/variants/{id} — update a variant. */
    public function update(Request $request, int $itemId, int $id): JsonResponse
    {
        $variant = Variant::where('item_id', $itemId)->findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:100',
            'name_dv' => 'nullable|string|max:100',
            'price' => 'sometimes|numeric|min:0',
            'cost' => 'nullable|numeric|min:0',
            'sku' => ['nullable', 'string', 'max:100', new UniqueScanCode('variants', $id, $variant->sku)],
            'barcode' => ['nullable', 'string', 'max:100', new UniqueScanCode('variants', $id, $variant->barcode)],
            'track_stock' => 'nullable|boolean',
            'stock_qty' => 'nullable|integer|min:0',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'consumption_factor' => 'nullable|numeric|min:0|max:1000',
            'is_active' => 'nullable|boolean',
            'is_available' => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        $before = (int) $variant->stock_qty;
        $variant->update($data);
        app(\App\Services\StockManagementService::class)
            ->recordVariantStockEdit($variant, $before, (int) $variant->stock_qty, $request->user()?->id, 'Edited via variants API');

        return response()->json(['variant' => $this->formatVariant($variant->fresh())]);
    }

    /** DELETE /items/{itemId}/variants/{id} — deactivate or hard-delete. */
    public function destroy(int $itemId, int $id): JsonResponse
    {
        $variant = Variant::where('item_id', $itemId)->findOrFail($id);
        $this->syncService->destroy($variant);

        return response()->json(['message' => 'Variant removed.']);
    }

    private function formatVariant(Variant $v): array
    {
        return [
            'id' => $v->id,
            'item_id' => $v->item_id,
            'name' => $v->name,
            'name_dv' => $v->name_dv,
            'price' => $v->price,
            'cost' => $v->cost,
            'sku' => $v->sku,
            'barcode' => $v->barcode,
            'track_stock' => $v->track_stock,
            'stock_qty' => $v->stock_qty,
            'low_stock_threshold' => $v->low_stock_threshold,
            'consumption_factor' => $v->consumptionFactor(),
            'is_active' => $v->is_active,
            'is_available' => $v->isAvailableNow(),
            'sort_order' => $v->sort_order,
            'created_at' => $v->created_at?->toIso8601String(),
            'updated_at' => $v->updated_at?->toIso8601String(),
        ];
    }
}
