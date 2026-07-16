<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstItemTaxNormalizer;
use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Menu\Services\ComboCompositionService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Services\ItemAvailabilityService;
use App\Services\RecipeCostCalculator;
use App\Services\SpecialPricingService;
use App\Services\VariantSyncService;
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
    public function index(Request $request, KitchenMenuResolver $kitchenMenuResolver, ItemAvailabilityService $availability, SpecialPricingService $specialPricing)
    {
        $isAdmin = $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');
        // Public /items route — POS passes view=pos without staff middleware.
        $isPosView = $request->query('view') === 'pos';

        $with = ['category', 'variants', 'modifiers'];
        if ($isAdmin && !$isPosView) {
            $with[] = 'menuGroup';
            $with[] = 'channelAvailabilities';
            $with[] = 'comboItems.item';
            $with[] = 'recipe.recipeItems.inventoryItem';
        }
        $query = Item::with($with);

        if (!$isAdmin) {
            $query->withCount(['reviews as review_count' => fn ($q) => $q->where('status', 'approved')])
                ->withAvg(['reviews as avg_rating' => fn ($q) => $q->where('status', 'approved')], 'rating');
        }

        $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);

        if (!$isAdmin) {
            $query->where('is_active', true);
            $query->with(['comboItems.item:id,name,name_dv,base_price,image_url,is_available,has_variants']);
            $kitchenMenuResolver->scopeItemsForChannel($query, $channel);
        } elseif ($isPosView) {
            // POS register only needs sellable items for the active order
            // type — skip the admin payload (channel grid, cost, stock).
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

        $perPage = $isPosView
            ? min(100, max(10, (int) $request->input('per_page', 100)))
            : ($isAdmin
                ? min(100, max(10, (int) $request->input('per_page', 25)))
                : 100); // public menu always gets all items
        $items = $query->orderBy('sort_order')->orderBy('name')->paginate($perPage);

        // Admin gets full data; public / POS get stripped response + availability metadata
        $transformed = $items->through(function ($item) use ($isAdmin, $isPosView, $availability, $channel, $specialPricing) {
            $includeAvailability = !$isAdmin || $isPosView;
            $includeAdminExtras = $isAdmin && !$isPosView;
            $recipeCosts = $includeAdminExtras ? app(RecipeCostCalculator::class) : null;
            $activeSpecial = $includeAvailability
                ? $specialPricing->activeSpecialsByItemId()->get($item->id)
                : null;
            $baseSpecial = $includeAvailability
                ? $specialPricing->resolveUnitPrice($item->id, (float) $item->base_price, $item)
                : null;
            $data = [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'sku' => $item->sku,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'tax_rate' => $item->tax_rate,
                'tax_code' => $item->tax_code ?? 'standard_8',
                'is_available' => $item->is_available,
                'is_active' => $item->is_active,
                'sort_order' => $item->sort_order,
                'category_id' => $item->category_id,
                'menu_group_id' => $item->menu_group_id,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                ] : null,
                'menu_group' => $includeAdminExtras && $item->menuGroup ? [
                    'id' => $item->menuGroup->id,
                    'name' => $item->menuGroup->name,
                    'slug' => $item->menuGroup->slug,
                ] : null,
                'channel_availabilities' => $includeAdminExtras
                    ? $item->channelAvailabilities->map(fn ($r) => [
                        'channel' => $r->channel,
                        'is_enabled' => $r->is_enabled,
                        'valid_from' => $r->valid_from?->toIso8601String(),
                        'valid_until' => $r->valid_until?->toIso8601String(),
                    ])->values()->all()
                    : null,
                'has_variants' => $item->has_variants,
                'track_stock' => $includeAdminExtras ? (bool) $item->track_stock : null,
                'stock_quantity' => $includeAdminExtras ? (int) $item->stock_quantity : null,
                'low_stock_threshold' => $includeAdminExtras ? (int) $item->low_stock_threshold : null,
                'availability_type' => $includeAdminExtras ? $item->availability_type : null,
                'variants' => $item->variants
                    ->sortBy('sort_order')
                    ->map(function ($v) use ($includeAdminExtras, $includeAvailability, $item, $specialPricing) {
                        $variantRow = $includeAdminExtras ? [
                            'id' => $v->id,
                            'name' => $v->name,
                            'name_dv' => $v->name_dv,
                            'price' => $v->price,
                            'cost' => $v->cost,
                            'sku' => $v->sku,
                            'track_stock' => $v->track_stock,
                            'stock_qty' => $v->stock_qty,
                            'low_stock_threshold' => $v->low_stock_threshold,
                            'is_active' => $v->is_active,
                            'sort_order' => $v->sort_order,
                        ] : [
                            'id' => $v->id,
                            'name' => $v->name,
                            'name_dv' => $v->name_dv,
                            'price' => $v->price,
                            'is_active' => $v->is_active,
                            'sort_order' => $v->sort_order,
                        ];

                        if ($includeAvailability) {
                            $variantPricing = $specialPricing->resolveUnitPrice($item->id, (float) $v->price, $item, $v->id);
                            if ($variantPricing->hasDiscount()) {
                                $variantRow['original_price'] = $variantPricing->originalPrice;
                                $variantRow['effective_price'] = $variantPricing->unitPrice;
                            }
                        }

                        return $variantRow;
                    })
                    ->values(),
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
            ];

            // Public / POS callers receive availability metadata
            if ($includeAvailability) {
                $specialBlock = $baseSpecial?->toApiBlock();
                if (!$specialBlock && $activeSpecial) {
                    $hasVariantDiscount = $item->has_variants
                        && collect($data['variants'])->contains(fn ($v) => isset($v['effective_price']));
                    if ($hasVariantDiscount) {
                        $specialBlock = [
                            'id' => $activeSpecial->id,
                            'badge_label' => match (true) {
                                (bool) $activeSpecial->badge_label => $activeSpecial->badge_label === 'Special'
                                    ? SpecialPricingService::DEFAULT_BADGE_LABEL
                                    : $activeSpecial->badge_label,
                                default => SpecialPricingService::DEFAULT_BADGE_LABEL,
                            },
                            'discount_pct' => $activeSpecial->discount_pct,
                            'original_price' => null,
                            'effective_price' => null,
                        ];
                    }
                }
                if ($specialBlock) {
                    $data['special'] = $specialBlock;
                }

                if (!$isAdmin) {
                    $data['spice_level'] = $item->spice_level ?? null;
                    $data['is_combo'] = (bool) ($item->is_combo ?? false);
                    $data['combo_discount_pct'] = $item->combo_discount_pct;
                    if ($data['is_combo'] && $item->relationLoaded('comboItems')) {
                        $data['combo_items'] = $item->comboItems->map(fn ($row) => [
                            'item_id' => $row->item_id,
                            'quantity' => $row->quantity,
                            'is_optional' => $row->is_optional,
                            'item' => $row->item ? [
                                'id' => $row->item->id,
                                'name' => $row->item->name,
                                'name_dv' => $row->item->name_dv,
                                'base_price' => $row->item->base_price,
                                'image_url' => $row->item->display_image_url ?? $row->item->image_url,
                                'is_available' => $row->item->is_available,
                                'has_variants' => $row->item->has_variants,
                            ] : null,
                        ])->values();
                    }
                    $data['dietary_tags'] = $item->dietary_tags ?? [];
                    $data['prep_time_minutes'] = $item->prep_time_minutes ?? null;
                    $data['avg_rating'] = $item->avg_rating !== null ? round((float) $item->avg_rating, 1) : null;
                    $data['review_count'] = (int) ($item->review_count ?? 0);
                }

                if ($isPosView) {
                    $data['availability'] = [
                        'available' => $item->is_available && $item->is_active,
                        'reason_code' => $item->is_available ? null : 'item_unavailable',
                        'reason_message' => $item->is_available ? null : 'This item is currently unavailable.',
                        'available_stock' => null,
                    ];
                } else {
                    $result = $availability->check($item, $channel);
                    $data['availability'] = [
                        'available' => $result->allowed,
                        'reason_code' => $result->reasonCode,
                        'reason_message' => $result->message ?: null,
                        'available_stock' => $result->availableStock,
                    ];
                }
            }

            if ($includeAdminExtras) {
                $data['is_combo'] = (bool) ($item->is_combo ?? false);
                $data['combo_discount_pct'] = $item->combo_discount_pct;
                $data['cost'] = $item->cost !== null ? (float) $item->cost : null;
                $data['recipe_cost'] = $recipeCosts?->forItem($item);
                $data['effective_cost'] = $recipeCosts?->effectiveCost($item);
                $data['dietary_tags'] = $item->dietary_tags ?? [];
                $data['allergens'] = $item->allergens ?? [];
                $data['combo_items'] = $item->relationLoaded('comboItems')
                    ? $item->comboItems->map(fn ($row) => [
                        'item_id' => $row->item_id,
                        'quantity' => $row->quantity,
                        'is_optional' => $row->is_optional,
                        'item' => $row->item ? [
                            'id' => $row->item->id,
                            'name' => $row->item->name,
                            'base_price' => $row->item->base_price,
                        ] : null,
                    ])->values()
                    : [];
            }

            return $data;
        });

        return response()->json($transformed);
    }

    /**
     * Store a newly created item
     */
    public function store(StoreItemRequest $request, VariantSyncService $variantSync, ComboCompositionService $combos)
    {
        $data = $request->validated();
        $data = app(GstItemTaxNormalizer::class)->normalize($data);
        $variantsData = $data['variants'] ?? null;
        $channelRows = $data['channel_availability'] ?? null;
        $comboRows = $data['combo_items'] ?? null;
        unset($data['variants'], $data['modifier_ids'], $data['channel_availability'], $data['combo_items']);

        $item = Item::create($data);

        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        if ($variantsData !== null) {
            $variantSync->sync($item, $variantsData);
        }

        // Seed channel availability so the item actually appears on the
        // public menus that ask for it. The backfill migration only
        // covered items that existed at that point in time — without
        // this, every new admin-created item silently fails the
        // `whereExists(item_channel_availability)` check in
        // KitchenMenuResolver::scopeItemsForChannel and never shows up
        // on the POS or the website.
        //
        // Honour an explicit `channel_availability` array if the admin
        // form sent one (mirrors `update()`), otherwise default to
        // enabled on every channel so the new item is immediately
        // sellable everywhere. Admin can dial it back from the toggle
        // grid.
        if (is_array($channelRows) && $channelRows !== []) {
            foreach ($channelRows as $row) {
                if (empty($row['channel'])) {
                    continue;
                }
                ItemChannelAvailability::query()->updateOrCreate(
                    ['item_id' => $item->id, 'channel' => $row['channel']],
                    [
                        'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                        'valid_from' => $row['valid_from'] ?? null,
                        'valid_until' => $row['valid_until'] ?? null,
                    ],
                );
            }
        } else {
            foreach (KitchenMenuResolver::CHANNELS as $channel) {
                ItemChannelAvailability::query()->firstOrCreate(
                    ['item_id' => $item->id, 'channel' => $channel],
                    ['is_enabled' => true],
                );
            }
        }

        if ($item->is_combo && is_array($comboRows)) {
            $combos->sync($item, $comboRows);
        }

        return response()->json([
            'message' => 'Item created successfully',
            'item' => $item->load(['category', 'variants', 'modifiers', 'channelAvailabilities', 'comboItems.item']),
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

        if (!$isAdmin) {
            $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);
            if (!$kitchenMenuResolver->isItemVisibleForChannel($item, $channel)) {
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
                'tax_code' => $item->tax_code ?? 'standard_8',
                'is_available' => $item->is_available,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                    'name_dv' => $item->category->name_dv,
                ] : null,
                'has_variants' => $item->has_variants,
                'variants' => $item->variants
                    ->where('is_active', true)
                    ->sortBy('sort_order')
                    ->map(fn ($v) => [
                        'id' => $v->id,
                        'name' => $v->name,
                        'name_dv' => $v->name_dv,
                        'price' => $v->price,
                        'is_active' => $v->is_active,
                        'sort_order' => $v->sort_order,
                    ])
                    ->values(),
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
    public function showWithRecipe($id, RecipeCostCalculator $recipeCosts)
    {
        $item = Item::with(['category', 'variants', 'modifiers', 'recipe.recipeItems.inventoryItem'])
            ->findOrFail($id);

        $computedCost = $recipeCosts->forItem($item);

        return response()->json([
            'item' => $item,
            'recipe_cost' => $computedCost,
            'effective_cost' => $recipeCosts->effectiveCost($item),
        ]);
    }

    /**
     * Update an item
     */
    public function update(UpdateItemRequest $request, $id, VariantSyncService $variantSync, ComboCompositionService $combos)
    {
        $item = Item::findOrFail($id);
        $data = $request->validated();
        if (array_key_exists('tax_code', $data) || array_key_exists('tax_rate', $data)) {
            $data = app(GstItemTaxNormalizer::class)->normalize(array_merge([
                'tax_code' => $item->tax_code,
                'tax_rate' => $item->tax_rate,
            ], $data));
        }
        $variantsData = $data['variants'] ?? null;
        $comboRows = $data['combo_items'] ?? null;
        unset($data['channel_availability'], $data['variants'], $data['modifier_ids'], $data['combo_items']);
        $item->update($data);

        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        if ($variantsData !== null) {
            $variantSync->sync($item, $variantsData);
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

        if ($request->has('combo_items') || array_key_exists('is_combo', $data)) {
            $item->refresh();
            if ($item->is_combo && is_array($comboRows)) {
                $combos->sync($item, $comboRows);
            } elseif (!$item->is_combo) {
                $combos->sync($item, []);
            }
        }

        return response()->json([
            'message' => 'Item updated successfully',
            'item' => $item->load(['category', 'variants', 'modifiers', 'menuGroup', 'channelAvailabilities', 'comboItems.item']),
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
            $itemCode = $m[1];           // 5-digit item reference
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

        if (!$isStaff) {
            $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);
            if (!$kitchenMenuResolver->isItemVisibleForChannel($item, $channel)) {
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
                'item_id' => $item->id,
                'name' => $item->name,
                'barcode' => $item->barcode,
                'sku' => $item->sku ?? null,
                'price' => $item->base_price,
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
        $public = $items->map(fn ($item) => [
            'id' => $item->id,
            'is_available' => $item->availability_type !== 'unavailable'
                && (!$item->track_stock || $item->stock_quantity > 0),
        ]);

        return response()->json(['items' => $public]);
    }
}
