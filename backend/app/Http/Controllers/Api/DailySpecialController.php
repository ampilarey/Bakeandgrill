<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\DailySpecial;
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
        $specials = DailySpecial::with('item:id,name,base_price')
            ->orderByDesc('start_date')
            ->paginate(20);

        return response()->json([
            'data' => collect($specials->items())->map(fn ($s) => $this->format($s)),
            'meta' => ['current_page' => $specials->currentPage(), 'last_page' => $specials->lastPage(), 'total' => $specials->total()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateSpecialPayload($request, true);
        $this->assertNoPricingConflict($validated);
        $this->assertNoOverlappingSpecial($validated);

        $special = DailySpecial::create($validated);
        $this->pricing->bustCache();

        return response()->json(['special' => $this->format($special->load('item'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $special = DailySpecial::findOrFail($id);
        $validated = $this->validateSpecialPayload($request, false);
        $merged = array_merge($special->only([
            'item_id', 'special_price', 'discount_pct', 'start_date', 'end_date', 'is_active',
        ]), $validated);
        $this->assertNoPricingConflict($merged);
        $this->assertNoOverlappingSpecial($merged, $special->id);

        $special->update($validated);
        $this->pricing->bustCache();

        return response()->json(['special' => $this->format($special->fresh()->load('item'))]);
    }

    public function destroy(int $id): JsonResponse
    {
        DailySpecial::findOrFail($id)->delete();
        $this->pricing->bustCache();

        return response()->json(['message' => 'Deleted.']);
    }

    /** @return array<string, mixed> */
    private function validateSpecialPayload(Request $request, bool $creating): array
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

        return $request->validate($rules);
    }

    /** @param array<string, mixed> $data */
    private function assertNoPricingConflict(array $data): void
    {
        $hasPrice = isset($data['special_price']) && $data['special_price'] !== null && $data['special_price'] !== '';
        $hasPct = isset($data['discount_pct']) && $data['discount_pct'] !== null && $data['discount_pct'] !== '';

        if (!$hasPrice && !$hasPct) {
            throw ValidationException::withMessages([
                'special_price' => ['Provide either a special price or a discount percentage.'],
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

    private function format(DailySpecial $s): array
    {
        $item = $s->item;
        $basePrice = $item ? (float) $item->base_price : null;
        $effective = $basePrice !== null ? $s->getEffectivePriceFor($basePrice) : null;

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
