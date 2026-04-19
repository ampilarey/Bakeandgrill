<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Services\ItemAvailabilityService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ItemController extends Controller
{
    private function resolvePublicChannel(Request $request, KitchenMenuResolver $resolver): string
    {
        $ch = $request->query('channel');
        if (is_string($ch) && in_array($ch, KitchenMenuResolver::CHANNELS, true)) {
            return $ch;
        }

        $ot = $request->query('for_order_type');
        if (is_string($ot)) {
            return $resolver->channelForOrderType($ot);
        }

        return 'online_pickup';
    }

    /**
     * Display a listing of items
     */
    public function index(Request $request, KitchenMenuResolver $kitchenMenuResolver, ItemAvailabilityService $availability)
    {
        $isAdmin = $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');

        $with = ['category', 'variants', 'modifiers'];
        if ($isAdmin) {
            $with[] = 'menuGroup';
            $with[] = 'channelAvailabilities';
        }
        $query = Item::with($with);

        $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);

        if (!$isAdmin) {
            $query->where('is_active', true);
            $kitchenMenuResolver->scopeItemsForChannel($query, $channel);
        }

        // Filter by category
        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        // Search by name or SKU (capped at 100 characters to prevent LIKE abuse)
        if ($request->has('search')) {
            $search = Str::limit(strip_tags($request->query('search', '')), 100, '');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('name_dv', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        // Filter by availability (public only)
        if (!$isAdmin && $request->has('available_only')) {
            $query->where('is_available', true);
        }

        $perPage = $isAdmin
            ? min(100, max(10, (int) $request->input('per_page', 25)))
            : 100; // public menu always gets all items
        $items = $query->orderBy('sort_order')->orderBy('name')->paginate($perPage);

        // Admin gets full data; public gets stripped response + availability metadata
        $transformed = $items->through(function ($item) use ($isAdmin, $availability, $channel) {
            $data = [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'sku' => $item->sku,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'tax_rate' => $item->tax_rate,
                'is_available' => $item->is_available,
                'is_active' => $item->is_active,
                'sort_order' => $item->sort_order,
                'category_id' => $item->category_id,
                'menu_group_id' => $item->menu_group_id,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                ] : null,
                'menu_group' => $item->menuGroup ? [
                    'id' => $item->menuGroup->id,
                    'name' => $item->menuGroup->name,
                    'slug' => $item->menuGroup->slug,
                ] : null,
                'channel_availabilities' => $isAdmin
                    ? $item->channelAvailabilities->map(fn ($r) => [
                        'channel' => $r->channel,
                        'is_enabled' => $r->is_enabled,
                        'valid_from' => $r->valid_from?->toIso8601String(),
                        'valid_until' => $r->valid_until?->toIso8601String(),
                    ])->values()->all()
                    : null,
                'variants' => $item->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'name' => $v->name,
                    'price' => $v->price,
                ]),
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
            ];

            // Additive: attach availability metadata for public callers.
            // Admin already has channel_availabilities; this is the unified view.
            if (!$isAdmin) {
                $result = $availability->check($item, $channel);
                $data['availability'] = [
                    'available'       => $result->allowed,
                    'reason_code'     => $result->reasonCode,
                    'reason_message'  => $result->message ?: null,
                    'available_stock' => $result->availableStock,
                ];
            }

            return $data;
        });

        return response()->json($transformed);
    }

    /**
     * Store a newly created item
     */
    public function store(StoreItemRequest $request)
    {
        $item = Item::create($request->validated());

        // Attach modifiers if provided
        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        return response()->json([
            'message' => 'Item created successfully',
            'item' => $item->load(['category', 'variants', 'modifiers']),
        ], 201);
    }

    /**
     * Display a specific item (PUBLIC - no recipe data)
     * For staff access with recipe data, use showWithRecipe
     */
    public function show(Request $request, KitchenMenuResolver $kitchenMenuResolver, $id)
    {
        $isAdmin = $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');

        $item = Item::with(['category', 'variants', 'modifiers'])
            ->where('is_active', true)
            ->findOrFail($id);

        if (! $isAdmin) {
            $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);
            if (! $kitchenMenuResolver->isItemVisibleForChannel($item, $channel)) {
                abort(404);
            }
        }

        // PUBLIC RESPONSE: Only customer-facing data, NO recipe/cost internals
        return response()->json([
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'tax_rate' => $item->tax_rate,
                'is_available' => $item->is_available,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                    'name_dv' => $item->category->name_dv,
                ] : null,
                'variants' => $item->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'name' => $v->name,
                    'price' => $v->price,
                ]),
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
            ],
        ]);
    }

    /**
     * Display item with recipe data (STAFF ONLY)
     */
    public function showWithRecipe($id)
    {
        $item = Item::with(['category', 'variants', 'modifiers', 'recipe.recipeItems.inventoryItem'])
            ->findOrFail($id);

        return response()->json(['item' => $item]);
    }

    /**
     * Update an item
     */
    public function update(UpdateItemRequest $request, $id)
    {
        $item = Item::findOrFail($id);
        $data = $request->validated();
        unset($data['channel_availability']);
        $item->update($data);

        // Update modifiers if provided
        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        if ($request->has('channel_availability')) {
            foreach ($request->input('channel_availability', []) as $row) {
                if (empty($row['channel'])) {
                    continue;
                }
                ItemChannelAvailability::query()->updateOrCreate(
                    [
                        'item_id' => $item->id,
                        'channel' => $row['channel'],
                    ],
                    [
                        'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                        'valid_from' => $row['valid_from'] ?? null,
                        'valid_until' => $row['valid_until'] ?? null,
                    ],
                );
            }
        }

        return response()->json([
            'message' => 'Item updated successfully',
            'item' => $item->load(['category', 'variants', 'modifiers', 'menuGroup', 'channelAvailabilities']),
        ]);
    }

    /**
     * Soft delete an item
     */
    public function destroy($id)
    {
        $item = Item::findOrFail($id);
        $item->delete();

        return response()->json([
            'message' => 'Item deleted successfully',
        ]);
    }

    /**
     * Lookup item by barcode.
     * Supports GS1 weight-embedded barcodes (prefix 2x, 13 digits):
     *   2[item_code_5_digits][weight_5_digits_grams][check_digit]
     * When detected, the decoded weight (in grams) is returned alongside the item.
     */
    public function lookupByBarcode(Request $request, KitchenMenuResolver $kitchenMenuResolver, $barcode)
    {
        $isStaff = $request->user() instanceof \App\Models\User
            && $request->user()->tokenCan('staff');

        $weightGrams = null;
        $lookupBarcode = $barcode;

        // Detect GS1-128 weight barcode: starts with 2, 13 digits
        if (preg_match('/^2(\d{5})(\d{5})\d$/', $barcode, $m)) {
            $itemCode  = $m[1];           // 5-digit item reference
            $weightGrams = (int) $m[2];   // grams encoded in the barcode
            $lookupBarcode = $itemCode;   // look up item by the short code
        }

        $item = Item::with(['category', 'variants', 'modifiers'])
            ->where(function ($q) use ($lookupBarcode) {
                $q->where('barcode', $lookupBarcode)
                  ->orWhere('sku', $lookupBarcode);
            })
            ->where('is_active', true)
            ->where('is_available', true)
            ->firstOrFail();

        if (! $isStaff) {
            $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);
            if (! $kitchenMenuResolver->isItemVisibleForChannel($item, $channel)) {
                abort(404);
            }
        }

        $response = ['item' => $item];
        if ($weightGrams !== null) {
            $response['weight_grams'] = $weightGrams;
            // Pre-calculate price for weight items using base_price (per 100g → convert from grams)
            if ($item->base_price) {
                $response['weight_price'] = (int) round($item->base_price * $weightGrams / 1000);
            }
        }

        return response()->json($response);
    }

    /**
     * Return barcode label data for printing.
     * The frontend/POS renders the label using this structured data.
     */
    public function barcodeLabel($id)
    {
        $item = Item::findOrFail($id);

        return response()->json([
            'label' => [
                'item_id'      => $item->id,
                'name'         => $item->name,
                'barcode'      => $item->barcode,
                'sku'          => $item->sku ?? null,
                'price'        => $item->base_price,
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Toggle item availability
     */
    public function toggleAvailability($id)
    {
        $item = Item::findOrFail($id);
        $item->update(['is_available' => !$item->is_available]);

        return response()->json([
            'message' => 'Item availability updated',
            'item' => $item,
        ]);
    }

    /**
     * POST /api/items/stock-check
     * Bulk stock availability check for multiple items.
     */
    public function bulkStockCheck(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate(['item_ids' => 'required|array|max:50', 'item_ids.*' => 'integer']);
        $isStaff = $request->user()?->tokenCan('staff');

        $items = Item::whereIn('id', $request->input('item_ids', []))
            ->select(['id', 'name', 'stock_quantity', 'track_stock', 'availability_type', 'low_stock_threshold'])
            ->get();

        if ($isStaff) {
            return response()->json(['items' => $items]);
        }

        // Public/customer callers receive availability booleans only — no raw stock counts
        $public = $items->map(fn($item) => [
            'id'           => $item->id,
            'is_available' => $item->availability_type !== 'unavailable'
                && (!$item->track_stock || $item->stock_quantity > 0),
        ]);

        return response()->json(['items' => $public]);
    }
}
