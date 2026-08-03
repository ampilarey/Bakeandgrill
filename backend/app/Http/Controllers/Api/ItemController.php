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
use App\Services\AvailabilityResult;
use App\Services\EffectivePriceService;
use App\Services\ItemAvailabilityService;
use App\Services\RecipeCostCalculator;
use App\Services\SpecialPricingService;
use App\Services\VariantSyncService;
use App\Support\MediaFileCleaner;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ItemController extends Controller
{
    private function resolvePublicChannel(Request $request, KitchenMenuResolver $resolver): string
    {
        $ch = $request->query('channel');
        // `catering` is a display/listing channel for the event wizard — it does
        // NOT make items orderable in immediate flows (ORDERING_CHANNELS).
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
    public function index(Request $request, KitchenMenuResolver $kitchenMenuResolver, ItemAvailabilityService $availability, SpecialPricingService $specialPricing, EffectivePriceService $effectivePricing)
    {
        $isAdmin = $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');
        // Public /items route — POS passes view=pos without staff middleware.
        $isPosView = $request->query('view') === 'pos';

        $with = ['category', 'variants', 'modifiers', 'packagingOptions'];
        if ($isAdmin && !$isPosView) {
            $with[] = 'menuGroup';
            $with[] = 'channelAvailabilities';
            $with[] = 'comboItems.item';
            $with[] = 'recipe.recipeItems.inventoryItem';
        }
        // Public / POS need catering flag for Events & Catering sections.
        if (!$isAdmin || $isPosView) {
            $with[] = 'channelAvailabilities';
        }
        $query = Item::with($with);

        if (!$isAdmin) {
            $query->withCount(['reviews as review_count' => fn ($q) => $q->where('status', 'approved')])
                ->withAvg(['reviews as avg_rating' => fn ($q) => $q->where('status', 'approved')], 'rating')
                // Last-30-day order lines for “most selling” menu filters (non-cancelled).
                ->withCount(['orderItems as sales_30d' => function ($q) {
                    $q->whereHas('order', function ($order) {
                        $order->where('status', '!=', 'cancelled')
                            ->where('created_at', '>=', now()->subDays(30));
                    });
                }]);
        }

        $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);

        if (!$isAdmin) {
            $query->where('is_active', true);
            $query->with([
                'comboItems.item:id,name,name_dv,base_price,image_url,is_available,has_variants',
                'photos',
            ]);
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
            $query->where('is_available', true)
                ->where(function ($q) {
                    $q->whereNull('snoozed_until')->orWhere('snoozed_until', '<=', now());
                });
        }

        $perPage = $isPosView
            ? min(100, max(10, (int) $request->input('per_page', 100)))
            : ($isAdmin
                ? min(100, max(10, (int) $request->input('per_page', 25)))
                : 100); // public menu always gets all items
        $items = $query->orderBy('sort_order')->orderBy('name')->paginate($perPage);

        // Admin gets full data; public / POS get stripped response + availability metadata
        $transformed = $items->through(function ($item) use ($isAdmin, $isPosView, $availability, $channel, $specialPricing, $effectivePricing) {
            $includeAvailability = !$isAdmin || $isPosView;
            $includeAdminExtras = $isAdmin && !$isPosView;
            $recipeCosts = $includeAdminExtras ? app(RecipeCostCalculator::class) : null;
            $activeSpecial = $includeAvailability
                ? $specialPricing->activeSpecialsByItemId()->get($item->id)
                : null;
            $baseSpecial = $includeAvailability
                ? $effectivePricing->resolveUnitPrice($item->id, (float) $item->base_price, $item)
                : null;
            $data = [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'card_name' => $item->card_name,
                'card_name_dv' => $item->card_name_dv,
                'description' => $item->description,
                'short_description' => $item->short_description,
                'short_description_dv' => $item->short_description_dv,
                'sku' => $item->sku,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'price_note' => $item->price_note,
                'packaging_fee' => (float) ($item->packaging_fee ?? 0),
                'packaging_fee_mode' => (string) ($item->packaging_fee_mode ?? 'per_unit'),
                'packaging_options' => app(\App\Domains\Catalog\Services\PackagingOptionsSyncService::class)->serializeActive($item),
                'tax_rate' => $item->tax_rate,
                'tax_code' => $item->tax_code ?? 'standard_8',
                'is_available' => $item->is_available,
                'snoozed_until' => $item->snoozed_until?->toIso8601String(),
                'unavailable_reason_note' => $item->unavailable_reason_note,
                'is_active' => $item->is_active,
                'sort_order' => $item->sort_order,
                // Signage board flags — default safely when the columns predate the migration.
                'show_on_signage' => (bool) ($item->show_on_signage ?? true),
                'is_signage_promoted' => (bool) ($item->is_signage_promoted ?? false),
                'created_at' => $item->created_at?->toIso8601String(),
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
                // Display flag only — does NOT make the item orderable by itself
                // (see KitchenMenuResolver::ORDERING_CHANNELS / CATERING-EVENTS-PLAN §2).
                'is_catering' => $item->relationLoaded('channelAvailabilities')
                    && $item->channelAvailabilities->contains(
                        fn ($r) => $r->channel === 'catering' && (bool) $r->is_enabled,
                    ),
                'has_variants' => $item->has_variants,
                'track_stock' => $includeAdminExtras ? (bool) $item->track_stock : null,
                'stock_quantity' => $includeAdminExtras ? (int) $item->stock_quantity : null,
                'low_stock_threshold' => $includeAdminExtras ? (int) $item->low_stock_threshold : null,
                'availability_type' => $includeAdminExtras ? $item->availability_type : null,
                'variants' => $item->variants
                    ->sortBy('sort_order')
                    ->map(function ($v) use ($includeAdminExtras, $includeAvailability, $item, $effectivePricing) {
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
                            $variantPricing = $effectivePricing->resolveUnitPrice($item->id, (float) $v->price, $item, $v->id);
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
                            'item_name' => $row->item?->name,
                            'quantity' => $row->quantity,
                            'is_optional' => $row->is_optional,
                            'unit_price' => $row->item ? (float) $row->item->base_price : 0,
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
                    $data['allergens'] = $item->allergens ?? [];
                    $data['calories'] = $item->calories !== null ? (int) $item->calories : null;
                    $data['prep_time_minutes'] = $item->prep_time_minutes ?? null;
                    $data['avg_rating'] = $item->avg_rating !== null ? round((float) $item->avg_rating, 1) : null;
                    $data['review_count'] = (int) ($item->review_count ?? 0);
                    $data['sales_30d'] = (int) ($item->sales_30d ?? 0);
                    $data['photos'] = $item->relationLoaded('photos')
                        ? $item->photos->map(fn ($p) => [
                            'id' => $p->id,
                            'url' => $p->url,
                            'sort_order' => (int) $p->sort_order,
                            'is_primary' => (bool) $p->is_primary,
                        ])->values()->all()
                        : [];
                }

                if ($isPosView) {
                    $posAllowed = $item->is_available && $item->is_active;
                    $posResult = $posAllowed
                        ? AvailabilityResult::available()
                        : AvailabilityResult::unavailable(
                            'item_unavailable',
                            'This item is currently unavailable.',
                        );
                    $data = $availability->withPublicAliases($data, $posResult, $item);
                } else {
                    $data = $availability->withPublicAliases(
                        $data,
                        $availability->check($item, $channel),
                        $item,
                    );
                }
            }

            if ($includeAdminExtras) {
                $data['image_original_url'] = $item->image_original_url;
                $data['is_combo'] = (bool) ($item->is_combo ?? false);
                $data['combo_discount_pct'] = $item->combo_discount_pct;
                $data['cost'] = $item->cost !== null ? (float) $item->cost : null;
                $data['recipe_cost'] = $recipeCosts?->forItem($item);
                $data['effective_cost'] = $recipeCosts?->effectiveCost($item);
                $data['dietary_tags'] = $item->dietary_tags ?? [];
                $data['allergens'] = $item->allergens ?? [];
                $data['calories'] = $item->calories !== null ? (int) $item->calories : null;
                $data['prep_time_minutes'] = $item->prep_time_minutes ?? null;
                $data['spice_level'] = $item->spice_level ?? null;
                $data['combo_items'] = $item->relationLoaded('comboItems')
                    ? $item->comboItems->map(fn ($row) => [
                        'item_id' => $row->item_id,
                        'item_name' => $row->item?->name,
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
        $packagingOptions = $data['packaging_options'] ?? null;
        unset($data['variants'], $data['modifier_ids'], $data['channel_availability'], $data['combo_items'], $data['packaging_options']);

        $item = Item::create($data);

        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        if ($variantsData !== null) {
            $variantSync->sync($item, $variantsData);
        }

        if ($packagingOptions !== null) {
            app(\App\Domains\Catalog\Services\PackagingOptionsSyncService::class)->sync($item, $packagingOptions);
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
                    // Catering is opt-in; ordering channels default on.
                    ['is_enabled' => $channel !== 'catering'],
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
    public function show(
        Request $request,
        KitchenMenuResolver $kitchenMenuResolver,
        ItemAvailabilityService $availability,
        $id,
    ) {
        $isAdmin = $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');

        $item = Item::with(['category', 'variants', 'modifiers', 'packagingOptions', 'channelAvailabilities'])
            ->where('is_active', true)
            ->findOrFail($id);

        $channel = 'online_pickup';
        if (!$isAdmin) {
            $channel = $this->resolvePublicChannel($request, $kitchenMenuResolver);
            if (!$kitchenMenuResolver->isItemVisibleForChannel($item, $channel)) {
                abort(404);
            }
        }

        // PUBLIC RESPONSE: Only customer-facing data, NO recipe/cost internals
        $payload = [
            'id' => $item->id,
            'name' => $item->name,
            'name_dv' => $item->name_dv,
            'card_name' => $item->card_name,
            'card_name_dv' => $item->card_name_dv,
            'description' => $item->description,
            'short_description' => $item->short_description,
            'short_description_dv' => $item->short_description_dv,
            'image_url' => $item->display_image_url,
            'base_price' => $item->base_price,
            'price_note' => $item->price_note,
            'packaging_fee' => (float) ($item->packaging_fee ?? 0),
            'packaging_fee_mode' => (string) ($item->packaging_fee_mode ?? 'per_unit'),
            'packaging_options' => app(\App\Domains\Catalog\Services\PackagingOptionsSyncService::class)->serializeActive($item),
            'tax_rate' => $item->tax_rate,
            'tax_code' => $item->tax_code ?? 'standard_8',
            'is_available' => $item->is_available,
            'created_at' => $item->created_at?->toIso8601String(),
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
            'is_catering' => $item->channelAvailabilities->contains(
                fn ($r) => $r->channel === 'catering' && (bool) $r->is_enabled,
            ),
        ];

        if (!$isAdmin) {
            $payload = $availability->withPublicAliases(
                $payload,
                $availability->check($item, $channel),
                $item,
            );
        }

        return response()->json(['item' => $payload]);
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
        $packagingOptions = $data['packaging_options'] ?? null;
        unset($data['channel_availability'], $data['variants'], $data['modifier_ids'], $data['combo_items'], $data['packaging_options']);

        $oldImageUrl = $item->image_url;
        $oldOriginalUrl = $item->image_original_url;
        $oldThumbUrl = $item->getAttribute('thumb_url');

        $item->update($data);

        $keep = array_values(array_filter([
            $item->image_url,
            $item->image_original_url,
            $item->getAttribute('thumb_url'),
        ], static fn ($u) => is_string($u) && $u !== ''));

        if ($oldImageUrl && $oldImageUrl !== $item->image_url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced($oldImageUrl, $keep, exceptItemId: (int) $item->id);
        }
        if ($oldOriginalUrl && $oldOriginalUrl !== $item->image_original_url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced($oldOriginalUrl, $keep, exceptItemId: (int) $item->id);
        }
        if (is_string($oldThumbUrl) && $oldThumbUrl !== '' && $oldThumbUrl !== $item->getAttribute('thumb_url')) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced($oldThumbUrl, $keep, exceptItemId: (int) $item->id);
        }

        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        if ($variantsData !== null) {
            $variantSync->sync($item, $variantsData);
        }

        if ($packagingOptions !== null) {
            app(\App\Domains\Catalog\Services\PackagingOptionsSyncService::class)->sync($item, $packagingOptions);
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

        $item = Item::with(['category', 'variants', 'modifiers', 'packagingOptions'])
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
     * PATCH /api/items/{id}/snooze
     * Body: {
     *   until: '2_hours'|'end_of_day'|'tomorrow'|'date'|'indefinite'|null,
     *   until_date?: Y-m-d (required when until=date),
     *   unavailable_reason_note?: string|null (optional, max 80)
     * }
     * null until clears the snooze / restores availability.
     */
    public function snooze(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'until' => ['present', 'nullable', 'string', 'in:2_hours,end_of_day,tomorrow,date,indefinite'],
            'until_date' => ['nullable', 'required_if:until,date', 'date', 'after_or_equal:today'],
            'unavailable_reason_note' => ['nullable', 'string', 'max:80'],
        ]);

        $item = Item::query()->findOrFail($id);
        $tz = config('app.timezone');
        $note = array_key_exists('unavailable_reason_note', $validated)
            ? (is_string($validated['unavailable_reason_note'])
                ? trim($validated['unavailable_reason_note'])
                : null)
            : $item->unavailable_reason_note;
        if ($note === '') {
            $note = null;
        }

        if ($validated['until'] === null) {
            $item->update([
                'is_available' => true,
                'snoozed_until' => null,
                'unavailable_reason_note' => null,
            ]);
            $message = 'Item restored.';
        } elseif ($validated['until'] === 'indefinite') {
            $item->update([
                'is_available' => false,
                'snoozed_until' => null,
                'unavailable_reason_note' => $note,
            ]);
            $message = 'Item marked unavailable.';
        } else {
            $snoozedUntil = match ($validated['until']) {
                '2_hours' => now()->timezone($tz)->addHours(2),
                'end_of_day' => now()->timezone($tz)->endOfDay(),
                'tomorrow' => now()->timezone($tz)->addDay()->endOfDay(),
                'date' => Carbon::parse($validated['until_date'], $tz)->endOfDay(),
                default => now()->timezone($tz)->endOfDay(),
            };
            $item->update([
                'is_available' => true,
                'snoozed_until' => $snoozedUntil,
                'unavailable_reason_note' => $note,
            ]);
            $message = match ($validated['until']) {
                '2_hours' => 'Item marked unavailable for 2 hours.',
                'tomorrow' => 'Item marked unavailable until end of tomorrow.',
                'date' => 'Item marked unavailable until '.$snoozedUntil->toDateString().'.',
                default => 'Item marked unavailable today.',
            };
        }

        $item->refresh();

        return response()->json([
            'message' => $message,
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
                'is_available' => (bool) $item->is_available,
                'snoozed_until' => $item->snoozed_until?->toIso8601String(),
                'is_snoozed' => $item->isSnoozed(),
                'unavailable_reason_note' => $item->unavailable_reason_note,
            ],
        ]);
    }

    /**
     * POST /api/items/stock-check
     * Bulk stock availability check for multiple items.
     */
    public function bulkStockCheck(Request $request): JsonResponse
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
