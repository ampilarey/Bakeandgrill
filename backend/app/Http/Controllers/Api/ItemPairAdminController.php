<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Item;
use App\Models\ItemPairStat;
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

        $query = ItemPairStat::query()
            ->select(
                'item_id',
                'paired_item_id',
                DB::raw('SUM(pair_count) as pair_count'),
            )
            ->groupBy('item_id', 'paired_item_id')
            ->orderByDesc(DB::raw('SUM(pair_count)'));

        $total = (clone $query)->get()->count();
        $rows = (clone $query)
            ->forPage($page, $perPage)
            ->get();

        $itemIds = $rows->flatMap(fn ($r) => [(int) $r->item_id, (int) $r->paired_item_id])->unique()->values();
        $names = Item::query()->whereIn('id', $itemIds)->pluck('name', 'id');

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'item_id' => (int) $row->item_id,
                'item_name' => (string) ($names[$row->item_id] ?? 'Unknown'),
                'paired_item_id' => (int) $row->paired_item_id,
                'paired_item_name' => (string) ($names[$row->paired_item_id] ?? 'Unknown'),
                'pair_count' => (int) $row->pair_count,
            ])->values(),
            'meta' => [
                'current_page' => $page,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                'total' => $total,
            ],
        ]);
    }
}
