<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\CustomerHabits;
use App\Domains\Kitchen\Services\ProductionCalendar;
use App\Domains\Kitchen\Services\ProductionPlanner;
use App\Domains\Kitchen\Support\PlanSlots;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\ProductionCalendarPeriod;
use App\Models\ProductionPlanItem;
use App\Models\ProductionPlanRecord;
use App\Models\Variant;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The production plan: what to make for a day, the calendar of days that
 * are not ordinary, the dials per item, and how past plans fared.
 */
class ProductionPlanController extends Controller
{
    public function __construct(
        private readonly ProductionPlanner $planner,
        private readonly ProductionCalendar $calendar,
        private readonly CustomerHabits $habits,
    ) {}

    /** GET /production-plan?date=YYYY-MM-DD (default: tomorrow) */
    public function plan(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $date = $validated['date'] ?? Carbon::now(config('app.timezone'))->addDay()->toDateString();

        return response()->json($this->planner->plan($date));
    }

    /** GET /production-plan/settings */
    public function settings(): JsonResponse
    {
        return response()->json([
            'settings' => PlanSlots::load(),
            'kinds' => ProductionCalendarPeriod::KINDS,
            'month_positions' => ProductionCalendar::monthPositions(),
        ]);
    }

    /** PUT /production-plan/settings */
    public function updateSettings(Request $request): JsonResponse
    {
        return response()->json(['settings' => PlanSlots::save($request->all())]);
    }

    /** PUT /production-plan/items/{itemId} — the dials for one item or size. */
    public function updateItem(Request $request, int $itemId): JsonResponse
    {
        $validated = $request->validate([
            'variant_id' => ['nullable', 'integer', 'min:0'],
            'enabled' => ['sometimes', 'boolean'],
            'service_level_pct' => ['sometimes', 'integer', 'min:50', 'max:99'],
            'round_to' => ['sometimes', 'integer', 'min:1', 'max:500'],
            'min_qty' => ['sometimes', 'integer', 'min:0', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:120'],
        ]);

        $item = Item::query()->findOrFail($itemId);
        $variantId = (int) ($validated['variant_id'] ?? 0);
        if ($variantId > 0) {
            Variant::query()->where('item_id', $item->id)->findOrFail($variantId);
        }

        $row = ProductionPlanItem::query()->firstOrNew(['item_id' => $item->id, 'variant_id' => $variantId]);
        $row->fill(collect($validated)->except('variant_id')->all());
        $row->save();
        // A first save only carries what was typed; the rest are the
        // column defaults, which live in the database.
        $row->refresh();

        return response()->json(['item' => $this->formatPlanItem($row)]);
    }

    /** GET /production-plan/calendar?from&to */
    public function calendar(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $tz = config('app.timezone');
        $from = $validated['from'] ?? Carbon::now($tz)->subWeeks(4)->toDateString();
        $to = $validated['to'] ?? Carbon::now($tz)->addWeeks(26)->toDateString();
        if ($to < $from) {
            [$from, $to] = [$to, $from];
        }

        $closures = array_filter(
            $this->calendar->closures(),
            fn (string $date) => $date >= $from && $date <= $to,
            ARRAY_FILTER_USE_KEY,
        );
        ksort($closures);

        return response()->json([
            'from' => $from,
            'to' => $to,
            'periods' => $this->calendar->periodsBetween($from, $to)
                ->map(fn (ProductionCalendarPeriod $p) => $this->formatPeriod($p))
                ->values(),
            'closures' => $closures,
            'kinds' => ProductionCalendarPeriod::KINDS,
        ]);
    }

    /** POST /production-plan/calendar */
    public function storeCalendar(Request $request): JsonResponse
    {
        $validated = $request->validate($this->periodRules(false));

        $period = ProductionCalendarPeriod::create($validated + ['created_by' => $request->user()?->id]);

        return response()->json(['period' => $this->formatPeriod($period)], 201);
    }

    /** PATCH /production-plan/calendar/{id} */
    public function updateCalendar(Request $request, int $id): JsonResponse
    {
        $period = ProductionCalendarPeriod::query()->findOrFail($id);
        $validated = $request->validate($this->periodRules(true));

        $starts = $validated['starts_on'] ?? $period->starts_on->toDateString();
        $ends = $validated['ends_on'] ?? $period->ends_on->toDateString();
        if ($ends < $starts) {
            return response()->json([
                'message' => 'The period cannot end before it starts.',
                'errors' => ['ends_on' => ['The period cannot end before it starts.']],
            ], 422);
        }

        $period->fill($validated)->save();

        return response()->json(['period' => $this->formatPeriod($period->fresh())]);
    }

    /** DELETE /production-plan/calendar/{id} */
    public function destroyCalendar(int $id): JsonResponse
    {
        ProductionCalendarPeriod::query()->findOrFail($id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** POST /production-plan/commit — save the decided quantities for a day. */
    public function commit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'lines' => ['required', 'array', 'min:1', 'max:2000'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.variant_id' => ['nullable', 'integer', 'min:0'],
            'lines.*.slot_start' => ['required', 'integer', 'min:0', 'max:23'],
            'lines.*.slot_end' => ['required', 'integer', 'min:0', 'max:23'],
            'lines.*.slot_label' => ['nullable', 'string', 'max:40'],
            'lines.*.forecast_qty' => ['required', 'numeric', 'min:0', 'max:100000'],
            'lines.*.planned_qty' => ['required', 'numeric', 'min:0', 'max:100000'],
        ]);

        $userId = $request->user()?->id;
        $saved = 0;
        foreach ($validated['lines'] as $line) {
            ProductionPlanRecord::query()->updateOrCreate(
                [
                    'plan_date' => $validated['date'],
                    'slot_start' => (int) $line['slot_start'],
                    'item_id' => (int) $line['item_id'],
                    'variant_id' => (int) ($line['variant_id'] ?? 0),
                ],
                [
                    'slot_end' => (int) $line['slot_end'],
                    'slot_label' => $line['slot_label'] ?? null,
                    'forecast_qty' => (float) $line['forecast_qty'],
                    'planned_qty' => (float) $line['planned_qty'],
                    'created_by' => $userId,
                ],
            );
            $saved++;
        }

        return response()->json(['date' => $validated['date'], 'saved' => $saved]);
    }

    /** GET /production-plan/accuracy?weeks=4 */
    public function accuracy(Request $request): JsonResponse
    {
        $validated = $request->validate(['weeks' => ['nullable', 'integer', 'min:1', 'max:26']]);

        return response()->json($this->planner->accuracy((int) ($validated['weeks'] ?? 4)));
    }

    /** GET /production-plan/customers?weeks=8 */
    public function customers(Request $request): JsonResponse
    {
        $validated = $request->validate(['weeks' => ['nullable', 'integer', 'min:2', 'max:26']]);

        return response()->json($this->habits->summary((int) ($validated['weeks'] ?? 8)));
    }

    /** @return array<string, list<mixed>> */
    private function periodRules(bool $partial): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return [
            'kind' => [$required, 'string', Rule::in(array_keys(ProductionCalendarPeriod::KINDS))],
            'label' => ['nullable', 'string', 'max:120'],
            'starts_on' => [$required, 'date_format:Y-m-d'],
            'ends_on' => [$required, 'date_format:Y-m-d', ...($partial ? [] : ['after_or_equal:starts_on'])],
            'expected_change_pct' => ['nullable', 'integer', 'min:-95', 'max:300'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, mixed> */
    private function formatPeriod(ProductionCalendarPeriod $period): array
    {
        return [
            'id' => $period->id,
            'kind' => $period->kind,
            'kind_label' => $period->kindLabel(),
            'label' => $period->label,
            'starts_on' => $period->starts_on->toDateString(),
            'ends_on' => $period->ends_on->toDateString(),
            'days' => $period->starts_on->diffInDays($period->ends_on) + 1,
            'expected_change_pct' => $period->expected_change_pct,
            'notes' => $period->notes,
        ];
    }

    /** @return array<string, mixed> */
    private function formatPlanItem(ProductionPlanItem $row): array
    {
        return [
            'item_id' => (int) $row->item_id,
            'variant_id' => (int) $row->variant_id,
            'enabled' => (bool) $row->enabled,
            'service_level_pct' => (int) $row->service_level_pct,
            'round_to' => (int) $row->round_to,
            'min_qty' => (int) $row->min_qty,
            'notes' => $row->notes,
        ];
    }
}
