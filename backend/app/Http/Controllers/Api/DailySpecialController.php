<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\DailySpecial;
use App\Models\DailySpecialVariant;
use App\Models\Item;
use App\Services\SpecialPricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;

class DailySpecialController extends Controller
{
    public function __construct(private SpecialPricingService $pricing) {}

    // ── Public: active specials for today ─────────────────────────────────────

    public function active(): JsonResponse
    {
        $specials = collect($this->pricing->activeSpecialsList())
            ->map(fn (DailySpecial $s) => $this->format($s))
            ->values();

        return response()->json(['specials' => $specials]);
    }

    // ── Admin CRUD ────────────────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $specials = DailySpecial::with(['item:id,name,base_price', 'variantOverrides.variant:id,name,price'])
            ->orderByDesc('start_date')
            ->paginate(20);

        return response()->json([
            'data' => collect($specials->items())->map(fn ($s) => $this->format($s)),
            'meta' => ['current_page' => $specials->currentPage(), 'last_page' => $specials->lastPage(), 'total' => $specials->total()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        [$validated, $variantOverrides] = $this->validateSpecialPayload($request, true);
        $this->assertNoPricingConflict($validated, $variantOverrides);
        $this->assertNoOverlappingSpecial($validated);

        $special = DailySpecial::create($validated);
        $this->syncVariantOverrides($special, $variantOverrides);
        $this->pricing->bustCache();

        return response()->json(['special' => $this->format($special->load(['item', 'variantOverrides.variant']))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $special = DailySpecial::findOrFail($id);
        [$validated, $variantOverrides] = $this->validateSpecialPayload($request, false, $request->has('variant_overrides'));
        $merged = array_merge($special->only([
            'item_id', 'special_price', 'discount_pct', 'start_date', 'end_date', 'is_active',
        ]), $validated);
        $overridesForCheck = $request->has('variant_overrides')
            ? $variantOverrides
            : $special->variantOverrides->map(fn (DailySpecialVariant $vo) => [
                'variant_id' => $vo->variant_id,
                'discount_pct' => $vo->discount_pct,
                'special_price' => $vo->special_price,
            ])->all();
        $this->assertNoPricingConflict($merged, $overridesForCheck);
        $this->assertNoOverlappingSpecial($merged, $special->id);

        $special->update($validated);
        if ($request->has('variant_overrides')) {
            $this->syncVariantOverrides($special, $variantOverrides);
        }
        $this->pricing->bustCache();

        return response()->json(['special' => $this->format($special->fresh()->load(['item', 'variantOverrides.variant']))]);
    }

    public function destroy(int $id): JsonResponse
    {
        DailySpecial::findOrFail($id)->delete();
        $this->pricing->bustCache();

        return response()->json(['message' => 'Deleted.']);
    }

    /**
     * @return array{0: array<string, mixed>, 1: list<array{variant_id: int, discount_pct: int|null, special_price: float|null}>}
     */
    private function validateSpecialPayload(Request $request, bool $creating, bool $includeVariantOverrides = true): array
    {
        $rules = [
            'badge_label' => ['nullable', 'string', 'max:60'],
            'special_price' => ['nullable', 'numeric', 'min:0'],
            'discount_pct' => ['nullable', 'integer', 'min:1', 'max:100'],
            'start_date' => [$creating ? 'required' : 'sometimes', 'date'],
            'end_date' => [$creating ? 'required' : 'sometimes', 'date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'days_of_week' => ['nullable', 'array'],
            'days_of_week.*' => ['integer', 'min:0', 'max:6'],
            'max_quantity' => ['nullable', 'integer', 'min:1'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ];

        if ($creating) {
            $rules['item_id'] = ['required', 'integer', 'exists:items,id'];
            $rules['end_date'][] = 'after_or_equal:start_date';
        }

        if ($includeVariantOverrides) {
            $rules['variant_overrides'] = ['nullable', 'array'];
            $rules['variant_overrides.*.variant_id'] = ['required', 'integer', 'exists:variants,id'];
            $rules['variant_overrides.*.discount_pct'] = ['nullable', 'integer', 'min:1', 'max:100'];
            $rules['variant_overrides.*.special_price'] = ['nullable', 'numeric', 'min:0'];
        }

        $validated = $request->validate($rules);

        $itemId = (int) ($validated['item_id'] ?? 0);
        if (!$itemId && !$creating) {
            $existing = DailySpecial::find($request->route('id'));
            $itemId = (int) ($existing?->item_id ?? 0);
        }

        $variantOverrides = $includeVariantOverrides
            ? $this->normalizeVariantOverrides($validated['variant_overrides'] ?? [])
            : [];

        if ($includeVariantOverrides) {
            unset($validated['variant_overrides']);
        }

        if ($itemId && $variantOverrides !== []) {
            $this->assertVariantOverridesBelongToItem($itemId, $variantOverrides);
        }

        return [$validated, $variantOverrides];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array{variant_id: int, discount_pct: int|null, special_price: float|null}>
     */
    private function normalizeVariantOverrides(array $rows): array
    {
        $normalized = [];

        foreach ($rows as $row) {
            $hasPrice = isset($row['special_price']) && $row['special_price'] !== null && $row['special_price'] !== '';
            $hasPct = isset($row['discount_pct']) && $row['discount_pct'] !== null && $row['discount_pct'] !== '';

            if (!$hasPrice && !$hasPct) {
                continue;
            }

            if ($hasPrice && $hasPct) {
                throw ValidationException::withMessages([
                    'variant_overrides' => ['Each variant override must use either a discount % or a special price, not both.'],
                ]);
            }

            $normalized[] = [
                'variant_id' => (int) $row['variant_id'],
                'discount_pct' => $hasPct ? (int) $row['discount_pct'] : null,
                'special_price' => $hasPrice ? (float) $row['special_price'] : null,
            ];
        }

        return $normalized;
    }

    /** @param list<array{variant_id: int, discount_pct: int|null, special_price: float|null}> $rows */
    private function assertVariantOverridesBelongToItem(int $itemId, array $rows): void
    {
        $allowed = Item::query()->findOrFail($itemId)->variants()->pluck('id')->all();

        foreach ($rows as $row) {
            if (!in_array($row['variant_id'], $allowed, true)) {
                throw ValidationException::withMessages([
                    'variant_overrides' => ['One or more variants do not belong to the selected item.'],
                ]);
            }
        }
    }

    /** @param array<string, mixed> $data @param list<array{variant_id: int, discount_pct: int|null, special_price: float|null}> $variantOverrides */
    private function assertNoPricingConflict(array $data, array $variantOverrides = []): void
    {
        $hasPrice = isset($data['special_price']) && $data['special_price'] !== null && $data['special_price'] !== '';
        $hasPct = isset($data['discount_pct']) && $data['discount_pct'] !== null && $data['discount_pct'] !== '';
        $hasVariantPricing = $variantOverrides !== [];

        if (!$hasPrice && !$hasPct && !$hasVariantPricing) {
            throw ValidationException::withMessages([
                'special_price' => ['Provide an item-level price or %, or set pricing on at least one variant.'],
            ]);
        }
    }

    /** @param array<string, mixed> $data */
    private function assertNoOverlappingSpecial(array $data, ?int $excludeId = null): void
    {
        if (($data['is_active'] ?? true) === false) {
            return;
        }

        $itemId = $data['item_id'] ?? null;
        if (!$itemId) {
            return;
        }

        $start = $data['start_date'] ?? null;
        $end = $data['end_date'] ?? null;
        if (!$start || !$end) {
            return;
        }

        $query = DailySpecial::query()
            ->where('item_id', $itemId)
            ->where('is_active', true)
            ->where('start_date', '<=', $end)
            ->where('end_date', '>=', $start);

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'item_id' => ['This item already has an active special overlapping that date range.'],
            ]);
        }
    }

    /** @param list<array{variant_id: int, discount_pct: int|null, special_price: float|null}> $rows */
    private function syncVariantOverrides(DailySpecial $special, array $rows): void
    {
        $special->variantOverrides()->delete();

        foreach ($rows as $row) {
            DailySpecialVariant::create([
                'daily_special_id' => $special->id,
                'variant_id' => $row['variant_id'],
                'discount_pct' => $row['discount_pct'],
                'special_price' => $row['special_price'],
            ]);
        }
    }

    private function format(DailySpecial $s): array
    {
        $item = $s->item;
        $basePrice = $item ? (float) $item->base_price : null;
        $effective = $basePrice !== null ? $s->getEffectivePriceFor($basePrice) : null;
        $variantOverrides = $s->relationLoaded('variantOverrides')
            ? $s->variantOverrides->map(function (DailySpecialVariant $vo) use ($s, $item) {
                $variant = $vo->variant;
                $catalog = $variant ? (float) $variant->price : null;

                return [
                    'variant_id' => $vo->variant_id,
                    'variant_name' => $variant?->name,
                    'catalog_price' => $catalog,
                    'discount_pct' => $vo->discount_pct,
                    'special_price' => $vo->special_price,
                    'effective_price' => $catalog !== null
                        ? $this->pricing->effectivePriceForSpecial($s, $catalog, $item, $vo->variant_id)
                        : null,
                ];
            })->values()->all()
            : [];

        return [
            'id' => $s->id,
            'item_id' => $s->item_id,
            'item_name' => $item?->name,
            'item_image' => $item?->image_url,
            'badge_label' => $s->badge_label ?? ($s->discount_pct ? "{$s->discount_pct}% OFF" : 'Special'),
            'special_price' => $s->special_price,
            'discount_pct' => $s->discount_pct,
            'effective_price' => $effective,
            'original_price' => $basePrice,
            'variant_overrides' => $variantOverrides,
            'description' => $s->description,
            'start_date' => $s->start_date->toDateString(),
            'end_date' => $s->end_date->toDateString(),
            'start_time' => $s->start_time,
            'end_time' => $s->end_time,
            'days_of_week' => $s->days_of_week,
            'is_active' => $s->is_active,
            'sold_count' => $s->sold_count,
            'max_quantity' => $s->max_quantity,
        ];
    }
}
