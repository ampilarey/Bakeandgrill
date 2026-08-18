<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Marketing\Services\ItemAffinityService;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\ItemSuggestionStat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ItemPairAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->input('page', 1));
        $perPage = min(50, max(10, (int) $request->input('per_page', 25)));

        // "count" keeps the old behaviour available; lift is the default because
        // ranking by raw co-occurrence just lists the bestseller against
        // everything else, which is a popularity report wearing a pairs hat.
        $sort = $request->input('sort') === 'count' ? 'count' : 'lift';

        // Each directed row already carries its own score, so no aggregate is
        // needed — item_id + paired_item_id is unique.
        $query = ItemPairStat::query()
            ->where('pair_count', '>=', ItemAffinityService::minPairSupport());

        $query = $sort === 'lift'
            ? $query->orderByDesc('lift')->orderByDesc('pair_count')
            : $query->orderByDesc('pair_count')->orderByDesc('lift');

        $total = (clone $query)->count();
        $rows = (clone $query)->forPage($page, $perPage)->get();

        $itemIds = $rows->flatMap(fn ($r) => [(int) $r->item_id, (int) $r->paired_item_id])->unique()->values();
        $names = Item::query()->whereIn('id', $itemIds)->pluck('name', 'id');

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'item_id' => (int) $row->item_id,
                'item_name' => (string) ($names[$row->item_id] ?? 'Unknown'),
                'paired_item_id' => (int) $row->paired_item_id,
                'paired_item_name' => (string) ($names[$row->paired_item_id] ?? 'Unknown'),
                'pair_count' => (int) $row->pair_count,
                'pair_revenue' => round((float) $row->pair_revenue, 2),
                // Percentage of the anchor's orders that also held the pair.
                'confidence' => round((float) $row->confidence * 100, 1),
                // 1.0 = no relationship beyond the paired item being popular.
                'lift' => round((float) $row->lift, 2),
                'anchor_orders' => (int) $row->anchor_orders,
            ])->values(),
            'meta' => [
                'current_page' => $page,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                'total' => $total,
                'sort' => $sort,
                'min_support' => ItemAffinityService::minPairSupport(),
                // So the page can say how stale it is — the job runs at 04:00.
                'computed_at' => ItemPairStat::query()->max('computed_at'),
            ],
        ]);
    }

    /**
     * Did the suggestions actually work?
     *
     * The pairs table describes customers; this describes the feature. It is
     * the only place that can answer whether the "Goes well with" panel is
     * worth its screen space, per surface and per item.
     */
    public function performance(Request $request): JsonResponse
    {
        $days = min(365, max(1, (int) $request->input('days', 30)));
        $since = now()->subDays($days)->toDateString();

        $rows = ItemSuggestionStat::query()
            ->select(
                'item_id',
                'surface',
                DB::raw('SUM(shown_count) as shown'),
                DB::raw('SUM(accepted_count) as accepted'),
                DB::raw('SUM(accepted_revenue) as revenue'),
            )
            ->where('stat_date', '>=', $since)
            ->groupBy('item_id', 'surface')
            ->orderByDesc(DB::raw('SUM(accepted_revenue)'))
            ->limit(100)
            ->get();

        $names = Item::query()
            ->whereIn('id', $rows->pluck('item_id')->unique()->all())
            ->pluck('name', 'id');

        $shown = (int) $rows->sum('shown');
        $accepted = (int) $rows->sum('accepted');

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'item_id' => (int) $row->item_id,
                'item_name' => (string) ($names[$row->item_id] ?? 'Unknown'),
                'surface' => (string) $row->surface,
                'shown' => (int) $row->shown,
                'accepted' => (int) $row->accepted,
                // The number that decides whether a suggestion keeps its slot.
                'take_rate' => (int) $row->shown > 0
                    ? round(((int) $row->accepted / (int) $row->shown) * 100, 1)
                    : 0.0,
                'revenue' => round((float) $row->revenue, 2),
            ])->values(),
            'meta' => [
                'days' => $days,
                'shown' => $shown,
                'accepted' => $accepted,
                'take_rate' => $shown > 0 ? round(($accepted / $shown) * 100, 1) : 0.0,
                'revenue' => round((float) $rows->sum('revenue'), 2),
            ],
        ]);
    }
}
