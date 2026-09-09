<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
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
            'purchase_units' => $item->purchaseUnits()->get(['id', 'name', 'base_units', 'barcode']),
            // Brands this item has actually been bought as, so the buying
            // screen can suggest them rather than asking anybody to remember
            // last week's spelling. Most recent first: what you bought last is
            // the likeliest thing you are buying now.
            'brands' => $this->recentBrands($itemId),
            // A picture of each brand on the shelf, where somebody has added
            // one (owner, 2026-09-09: "upload a pic of different brand of item
            // to know which brand is this"). Keyed by brand so a screen can
            // look one up without scanning the list.
            'brand_photos' => \App\Models\InventoryBrandPhoto::forItems([$itemId])[$itemId] ?? [],
            // What this item was last bought as, so the buying screen can
            // open on it instead of on a blank line. Owner, 2026-09-07:
            // "will the system remember the latest price, brand… by default
            // it should be selected the latest".
            'last_purchase' => $this->lastPurchase($item),
        ]);
    }

    /**
     * The most recent purchase line for an item: what was paid, whose brand
     * it was, and which box it came in.
     *
     * The pack is matched back to a live pack by name AND size, the same test
     * the purchase editor uses. A pack that has since been renamed, resized
     * or deleted resolves to null rather than to the wrong box, and the line
     * simply opens loose.
     *
     * @return array<string, mixed>|null
     */
    private function lastPurchase(InventoryItem $item): ?array
    {
        $line = DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->where('purchase_items.inventory_item_id', $item->id)
            ->where('purchases.status', '!=', 'cancelled')
            ->whereNull('purchases.deleted_at')
            ->orderByDesc('purchase_items.id')
            ->select([
                'purchase_items.brand',
                'purchase_items.unit_cost',
                'purchase_items.pack_name',
                'purchase_items.pack_size',
                'purchase_items.pack_quantity',
                'purchases.purchase_date',
                'purchases.supplier_id',
                'purchases.supplier_name_text',
            ])
            ->first();

        if ($line === null) {
            return null;
        }

        $packSize = $line->pack_size !== null ? (float) $line->pack_size : null;
        $unitCost = (float) $line->unit_cost;

        $packId = null;
        if ($packSize !== null && $packSize > 0 && $line->pack_name !== null) {
            $packId = $item->purchaseUnits()
                ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $line->pack_name))])
                ->get(['id', 'base_units'])
                ->first(fn ($p) => abs((float) $p->base_units - $packSize) < 0.000001)
                ?->id;
        }

        return [
            'brand' => $line->brand ?: null,
            // Per the item's own unit, always — the honest number to compare.
            'unit_cost' => round($unitCost, 6),
            // And what one box cost, which is what somebody types on a line
            // bought by the box.
            'pack_cost' => $packSize !== null && $packSize > 0 ? round($unitCost * $packSize, 2) : null,
            'purchase_unit_id' => $packId,
            'pack_name' => $line->pack_name,
            'pack_size' => $packSize,
            'pack_quantity' => $line->pack_quantity !== null ? (float) $line->pack_quantity : null,
            'purchase_date' => $line->purchase_date ? substr((string) $line->purchase_date, 0, 10) : null,
            'supplier' => $line->supplier_name_text
                ?: ($line->supplier_id ? \App\Models\Supplier::whereKey($line->supplier_id)->value('name') : null),
        ];
    }

    /**
     * Brands to offer for an item: the ones bought before, newest first, then
     * any written down against the item that have not been bought yet.
     *
     * Owner, 2026-09-09: "i want to save more than one brand, and photo is
     * optional." A brand recorded on the item is worth offering immediately —
     * waiting for a first purchase line to mention it means the person typing
     * that very line gets no help.
     *
     * @return list<string>
     */
    private function recentBrands(int $itemId, int $limit = 25): array
    {
        $bought = DB::table('purchase_items')
            ->where('inventory_item_id', $itemId)
            ->whereNotNull('brand')
            ->where('brand', '!=', '')
            ->selectRaw('brand, MAX(id) as last_id')
            ->groupBy('brand')
            ->orderByDesc('last_id')
            ->limit($limit)
            ->pluck('brand')
            ->all();

        $seen = [];
        $out = [];
        foreach ($bought as $brand) {
            $key = \App\Models\InventoryBrandPhoto::keyFor($brand);
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $brand;
        }

        // Spelling follows what was bought where both exist, so the pick list
        // matches the purchase history rather than quietly proposing a variant.
        $registered = DB::table('inventory_brand_photos')
            ->where('inventory_item_id', $itemId)
            ->orderBy('brand')
            ->pluck('brand', 'brand_key')
            ->all();
        foreach ($registered as $key => $brand) {
            if ($key === '' || isset($seen[$key]) || count($out) >= $limit) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $brand;
        }

        return $out;
    }

    /** 210.000000 reads as 210, 0.500000 as 0.5. */
    private function tidy(float $n): string
    {
        return rtrim(rtrim(number_format($n, 6, '.', ''), '0'), '.');
    }

    /**
     * A name this item has not used yet, built from the one that was typed
     * and the size it holds: "Packet" taken becomes "Packet 10", and if that
     * is taken too, "Packet 10 (2)".
     */
    private function freePackName(InventoryItem $item, string $typed, float $baseUnits): string
    {
        $taken = $item->purchaseUnits()->pluck('name')
            ->map(fn ($n) => mb_strtolower(trim((string) $n)))->all();

        $candidate = $typed . ' ' . $this->tidy($baseUnits);
        if (!in_array(mb_strtolower($candidate), $taken, true)) {
            return $candidate;
        }

        for ($i = 2; $i < 50; $i++) {
            $next = $candidate . " ({$i})";
            if (!in_array(mb_strtolower($next), $taken, true)) {
                return $next;
            }
        }

        return $candidate . ' ' . uniqid();
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
            // The EAN on this pack, so a scan can say WHICH tin arrived.
            'barcode' => 'nullable|string|max:64',
            /*
             * Yes, really change the size of the pack that already has this
             * name. Without it a name already in use is refused rather than
             * silently resized — see below.
             */
            'replace' => 'sometimes|boolean',
        ]);

        $barcode = isset($v['barcode']) ? trim((string) $v['barcode']) : '';
        if ($barcode !== '' && ($clash = $this->scanCodeOwner($barcode, null)) !== null) {
            return response()->json([
                'message' => 'That barcode is already used by ' . $clash . '.',
                'errors' => ['barcode' => ['A scan must resolve to exactly one thing.']],
            ], 422);
        }

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
            /*
             * A name already in use, for a different amount, is the dangerous
             * one. Owner, 2026-09-07: "sometimes we buy 6 pcs packets, and
             * sometimes 10 pcs packets" — two real sizes of the same thing.
             * Typing "Packet" for the second used to resize the first without
             * a word, so every later order of that item quietly became 10s.
             *
             * Both readings are legitimate — a correction, or a second size —
             * and only the person typing knows which, so ask. `replace` is
             * the correction; a distinct name is the second size, and one is
             * suggested so the answer is one click either way.
             */
            $wasSize = (float) $existing->base_units;
            if (!$request->boolean('replace') && abs($wasSize - $baseUnits) > 0.000001) {
                return response()->json([
                    'message' => sprintf(
                        '"%s" on %s already holds %s. Is this a correction, or a second size?',
                        $existing->name,
                        $item->name,
                        $this->tidy($wasSize),
                    ),
                    'conflict' => 'pack_name_in_use',
                    'existing' => [
                        'id' => $existing->id,
                        'name' => $existing->name,
                        'base_units' => $wasSize,
                    ],
                    'requested_base_units' => $baseUnits,
                    // "Packet" already taken, so "Packet 10" for the new size.
                    'suggested_name' => $this->freePackName($item, $name, $baseUnits),
                ], 409);
            }

            $existing->update(array_filter([
                'base_units' => $baseUnits,
                'barcode' => $barcode !== '' ? $barcode : null,
            ], fn ($x) => $x !== null));

            return response()->json(['purchase_unit' => $existing->fresh()]);
        }

        $unit = $item->purchaseUnits()->create([
            'name' => $name,
            'base_units' => $baseUnits,
            'barcode' => $barcode !== '' ? $barcode : null,
        ]);

        return response()->json(['purchase_unit' => $unit], 201);
    }

    /**
     * Correct a pack that is already defined.
     *
     * Owner, 2026-09-06: "no pack size edit option". Adding and removing was
     * the whole of it, so fixing a typo in "500 ml tin" meant deleting it and
     * losing the name a purchase order might already be showing.
     *
     * Changing the amount changes what *future* orders convert to. Past
     * purchases keep their own snapshot of the pack, so nothing already
     * received moves — which is what makes this safe to offer at all.
     */
    public function updatePurchaseUnit(Request $request, int $itemId, int $id)
    {
        $item = InventoryItem::findOrFail($itemId);
        $unit = $item->purchaseUnits()->findOrFail($id);

        $v = $request->validate([
            'name' => 'sometimes|string|max:40',
            'base_units' => 'sometimes|numeric|min:0.000001',
            'barcode' => 'sometimes|nullable|string|max:64',
        ]);

        if (array_key_exists('barcode', $v)) {
            $barcode = trim((string) ($v['barcode'] ?? ''));
            if ($barcode !== ''
                && $barcode !== (string) $unit->barcode
                && ($clash = $this->scanCodeOwner($barcode, $unit->id)) !== null) {
                return response()->json([
                    'message' => 'That barcode is already used by ' . $clash . '.',
                    'errors' => ['barcode' => ['A scan must resolve to exactly one thing.']],
                ], 422);
            }
            $unit->barcode = $barcode !== '' ? $barcode : null;
        }

        if (isset($v['name'])) {
            $name = trim($v['name']);
            if ($name === '') {
                return response()->json([
                    'message' => 'A pack needs a name.',
                    'errors' => ['name' => ['Give the pack a name.']],
                ], 422);
            }

            // Two packs with one name would make the picker ambiguous and an
            // old order impossible to trace back to the pack it meant.
            $clash = $item->purchaseUnits()
                ->whereKeyNot($unit->id)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                ->exists();

            if ($clash) {
                return response()->json([
                    'message' => 'This item already has a pack called that.',
                    'errors' => ['name' => ['Another pack of this item uses that name.']],
                ], 422);
            }

            $unit->name = $name;
        }

        if (isset($v['base_units'])) {
            $unit->base_units = (float) $v['base_units'];
        }

        $unit->save();

        return response()->json(['purchase_unit' => $unit->fresh()]);
    }

    /**
     * Who already answers to this code in the stock-side scan namespace —
     * item barcodes, item SKUs, and pack barcodes. Returns a human sentence
     * fragment naming the owner, or null when the code is free. The till-side
     * namespace (menu items and variants) is separate on purpose: a packet of
     * flour and a dish never meet the same scanner.
     */
    private function scanCodeOwner(string $code, ?int $ignorePurchaseUnitId): ?string
    {
        $item = InventoryItem::query()
            ->where(fn ($q) => $q->where('barcode', $code)->orWhere('sku', $code))
            ->first(['id', 'name']);
        if ($item !== null) {
            return 'the item "' . $item->name . '"';
        }

        $pack = InventoryPurchaseUnit::query()
            ->with('inventoryItem:id,name')
            ->where('barcode', $code)
            ->when($ignorePurchaseUnitId, fn ($q) => $q->whereKeyNot($ignorePurchaseUnitId))
            ->first();
        if ($pack !== null) {
            return 'the pack "' . $pack->name . '" of "' . ($pack->inventoryItem?->name ?? 'another item') . '"';
        }

        return null;
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
