<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\DailySpecial;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class DailySpecialController extends Controller
{
    // ── Public: active specials for today ─────────────────────────────────────

    public function active(): JsonResponse
    {
        $specials = DailySpecial::where('is_active', true)
            ->where('start_date', '<=', today())
            ->where('end_date', '>=', today())
            ->with('item:id,name,description,image_url,base_price,category_id')
            ->get()
            ->filter(fn(DailySpecial $s) => $s->isCurrentlyActive())
            ->map(fn(DailySpecial $s) => $this->format($s))
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
            'data' => collect($specials->items())->map(fn($s) => $this->format($s)),
            'meta' => ['current_page' => $specials->currentPage(), 'last_page' => $specials->lastPage(), 'total' => $specials->total()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id'       => ['required', 'integer', 'exists:items,id'],
            'badge_label'   => ['nullable', 'string', 'max:60'],
            'special_price' => ['nullable', 'numeric', 'min:0'],
            'discount_pct'  => ['nullable', 'integer', 'min:1', 'max:100'],
            'start_date'    => ['required', 'date'],
            'end_date'      => ['required', 'date', 'after_or_equal:start_date'],
            'start_time'    => ['nullable', 'date_format:H:i'],
            'end_time'      => ['nullable', 'date_format:H:i'],
            'days_of_week'  => ['nullable', 'array'],
            'days_of_week.*'=> ['integer', 'min:0', 'max:6'],
            'max_quantity'  => ['nullable', 'integer', 'min:1'],
            'description'   => ['nullable', 'string', 'max:500'],
            'is_active'     => ['sometimes', 'boolean'],
        ]);

        $special = DailySpecial::create($validated);

        return response()->json(['special' => $this->format($special->load('item'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $special   = DailySpecial::findOrFail($id);
        $validated = $request->validate([
            'badge_label'   => ['nullable', 'string', 'max:60'],
            'special_price' => ['nullable', 'numeric', 'min:0'],
            'discount_pct'  => ['nullable', 'integer', 'min:1', 'max:100'],
            'start_date'    => ['sometimes', 'date'],
            'end_date'      => ['sometimes', 'date'],
            'start_time'    => ['nullable', 'date_format:H:i'],
            'end_time'      => ['nullable', 'date_format:H:i'],
            'days_of_week'  => ['nullable', 'array'],
            'max_quantity'  => ['nullable', 'integer', 'min:1'],
            'description'   => ['nullable', 'string', 'max:500'],
            'is_active'     => ['sometimes', 'boolean'],
        ]);

        $special->update($validated);

        return response()->json(['special' => $this->format($special->fresh()->load('item'))]);
    }

    public function destroy(int $id): JsonResponse
    {
        DailySpecial::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    private function format(DailySpecial $s): array
    {
        $item = $s->item;

        return [
            'id'            => $s->id,
            'item_id'       => $s->item_id,
            'item_name'     => $item?->name,
            'item_image'    => $item?->image_url,
            'badge_label'   => $s->badge_label ?? ($s->discount_pct ? "{$s->discount_pct}% OFF" : 'Special'),
            'special_price' => $s->special_price,
            'discount_pct'  => $s->discount_pct,
            'effective_price' => $item ? $s->getEffectivePriceFor((float) $item->base_price) : null,
            'original_price'  => $item ? (float) $item->base_price : null,
            'description'   => $s->description,
            'start_date'    => $s->start_date->toDateString(),
            'end_date'      => $s->end_date->toDateString(),
            'start_time'    => $s->start_time,
            'end_time'      => $s->end_time,
            'days_of_week'  => $s->days_of_week,
            'is_active'     => $s->is_active,
            'sold_count'    => $s->sold_count,
            'max_quantity'  => $s->max_quantity,
        ];
    }
}
