<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\UnitConversion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Manages inventory categories and unit conversions.
 * Extracted from inline route closures in api_finance.php for testability.
 */
class InventoryConfigController extends Controller
{
    // ── Inventory Categories ──────────────────────────────────────────────────

    public function indexCategories()
    {
        return response()->json(['categories' => InventoryCategory::orderBy('name')->get()]);
    }

    public function storeCategory(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string',
        ]);

        $cat = InventoryCategory::create([
            ...$validated,
            'slug' => Str::slug($validated['name']),
        ]);

        return response()->json(['category' => $cat], 201);
    }

    public function updateCategory(Request $request, int $id)
    {
        $cat = InventoryCategory::findOrFail($id);

        $cat->update($request->validate([
            'name' => 'sometimes|string|max:100',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]));

        return response()->json(['category' => $cat]);
    }

    // ── Unit Conversions ──────────────────────────────────────────────────────

    public function indexConversions()
    {
        return response()->json(['conversions' => UnitConversion::all()]);
    }

    public function storeConversion(Request $request)
    {
        $v = $request->validate([
            'from_unit' => 'required|string|max:20',
            'to_unit' => 'required|string|max:20',
            'factor' => 'required|numeric|min:0.000001',
        ]);

        $uc = UnitConversion::updateOrCreate(
            ['from_unit' => $v['from_unit'], 'to_unit' => $v['to_unit']],
            ['factor' => $v['factor']],
        );

        app(\App\Services\UnitConversionService::class)->bustCache();

        return response()->json(['conversion' => $uc], 201);
    }

    public function destroyConversion(int $id)
    {
        UnitConversion::findOrFail($id)->delete();
        app(\App\Services\UnitConversionService::class)->bustCache();

        return response()->json(['message' => 'Deleted.']);
    }

    // ── Purchase units: the packs an item is bought in ────────────────────────

    /*
     * Distinct from unit conversions above, which are global by unit name and
     * so can hold exactly one meaning for "case". A case of eggs is 210 and a
     * case of bottles is 24, so the pack belongs to the item.
     */

    public function indexPurchaseUnits(int $itemId)
    {
        $item = InventoryItem::findOrFail($itemId);

        return response()->json([
            'base_unit' => $item->unit,
            'purchase_units' => $item->purchaseUnits()->get(['id', 'name', 'base_units']),
            // Brands this item has actually been bought as, so the buying
            // screen can suggest them rather than asking anybody to remember
            // last week's spelling. Most recent first: what you bought last is
            // the likeliest thing you are buying now.
            'brands' => $this->recentBrands($itemId),
        ]);
    }

    /**
     * Distinct brands bought for an item, newest first.
     *
     * @return list<string>
     */
    private function recentBrands(int $itemId, int $limit = 25): array
    {
        return DB::table('purchase_items')
            ->where('inventory_item_id', $itemId)
            ->whereNotNull('brand')
            ->where('brand', '!=', '')
            ->selectRaw('brand, MAX(id) as last_id')
            ->groupBy('brand')
            ->orderByDesc('last_id')
            ->limit($limit)
            ->pluck('brand')
            ->all();
    }

    public function storePurchaseUnit(Request $request, int $itemId)
    {
        $item = InventoryItem::findOrFail($itemId);

        $v = $request->validate([
            'name' => 'required|string|max:40',
            /*
             * Either say how many base units are in the pack, or build it from
             * a pack already defined: a case is 7 trays. The nested form is how
             * people actually describe a box, but it is resolved to the base
             * unit before storing so pricing a line never walks a chain.
             */
            'base_units' => 'required_without:of_purchase_unit_id|nullable|numeric|min:0.000001',
            'of_purchase_unit_id' => 'nullable|integer',
            'of_quantity' => 'required_with:of_purchase_unit_id|nullable|numeric|min:0.000001',
        ]);

        $name = trim($v['name']);
        $baseUnits = isset($v['base_units']) ? (float) $v['base_units'] : null;

        if (!empty($v['of_purchase_unit_id'])) {
            $inner = $item->purchaseUnits()->find($v['of_purchase_unit_id']);
            if ($inner === null) {
                return response()->json([
                    'message' => 'That pack belongs to a different item.',
                    'errors' => ['of_purchase_unit_id' => ['Pick a pack of this item.']],
                ], 422);
            }
            $baseUnits = (float) $v['of_quantity'] * (float) $inner->base_units;
        }

        if ($baseUnits === null || $baseUnits <= 0) {
            return response()->json([
                'message' => 'A pack has to hold more than nothing.',
                'errors' => ['base_units' => ['Say how much is in the pack.']],
            ], 422);
        }

        // Same name twice would make the picker ambiguous and the snapshot on
        // an old purchase impossible to trace back.
        $existing = $item->purchaseUnits()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->first();

        if ($existing !== null) {
            $existing->update(['base_units' => $baseUnits]);

            return response()->json(['purchase_unit' => $existing->fresh()]);
        }

        $unit = $item->purchaseUnits()->create([
            'name' => $name,
            'base_units' => $baseUnits,
        ]);

        return response()->json(['purchase_unit' => $unit], 201);
    }

    public function destroyPurchaseUnit(int $itemId, int $id)
    {
        $item = InventoryItem::findOrFail($itemId);
        $unit = $item->purchaseUnits()->findOrFail($id);
        $unit->delete();

        // Purchases keep their own copy of the pack, so deleting one here only
        // stops it being offered next time; no past order changes.
        return response()->json(['message' => 'Deleted.']);
    }
}
