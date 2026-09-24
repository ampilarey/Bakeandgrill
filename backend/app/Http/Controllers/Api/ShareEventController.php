<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemShareEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * The customer share loop (owner's shortlist, 2026-09-24). The website
 * and the order app send a beacon when somebody presses Share on an item
 * or a category; the Social Hub shows what gets shared most and offers to
 * make it a chef's pick. Public, throttled, no personal data.
 */
class ShareEventController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['nullable', 'integer'],
            'category_id' => ['nullable', 'integer'],
            'channel' => ['required', Rule::in(ItemShareEvent::CHANNELS)],
            'surface' => ['nullable', Rule::in(['web', 'order'])],
        ]);
        $itemId = !empty($data['item_id']) && Item::query()->whereKey((int) $data['item_id'])->exists() ? (int) $data['item_id'] : null;
        $categoryId = !empty($data['category_id']) && Category::query()->whereKey((int) $data['category_id'])->exists() ? (int) $data['category_id'] : null;
        if ($itemId === null && $categoryId === null) {
            return response()->json(['ok' => false], 204);
        }

        ItemShareEvent::create([
            'item_id' => $itemId,
            'category_id' => $categoryId,
            'channel' => $data['channel'],
            'surface' => $data['surface'] ?? 'web',
            'created_at' => now(),
        ]);

        return response()->json(['ok' => true], 201);
    }

    /** Admin: the most shared items and categories of the last N days. */
    public function top(Request $request): JsonResponse
    {
        $days = max(1, min(365, (int) $request->input('days', 30)));
        $since = now()->subDays($days);

        $items = ItemShareEvent::query()
            ->selectRaw('item_id, COUNT(*) AS shares')
            ->whereNotNull('item_id')
            ->where('created_at', '>=', $since)
            ->groupBy('item_id')
            ->orderByDesc('shares')
            ->limit(8)
            ->get();
        $itemRows = Item::query()->whereIn('id', $items->pluck('item_id'))->get(['id', 'name', 'is_featured', 'image_url'])->keyBy('id');

        $categories = ItemShareEvent::query()
            ->selectRaw('category_id, COUNT(*) AS shares')
            ->whereNotNull('category_id')
            ->where('created_at', '>=', $since)
            ->groupBy('category_id')
            ->orderByDesc('shares')
            ->limit(5)
            ->get();
        $categoryRows = Category::query()->whereIn('id', $categories->pluck('category_id'))->get(['id', 'name'])->keyBy('id');

        return response()->json([
            'days' => $days,
            'total' => ItemShareEvent::query()->where('created_at', '>=', $since)->count(),
            'items' => $items->map(fn ($row) => [
                'item_id' => (int) $row->item_id,
                'name' => $itemRows[$row->item_id]->name ?? ('Item #' . $row->item_id),
                'is_featured' => (bool) ($itemRows[$row->item_id]->is_featured ?? false),
                'image_url' => $itemRows[$row->item_id]->image_url ?? null,
                'shares' => (int) $row->shares,
            ])->values(),
            'categories' => $categories->map(fn ($row) => [
                'category_id' => (int) $row->category_id,
                'name' => $categoryRows[$row->category_id]->name ?? ('Category #' . $row->category_id),
                'shares' => (int) $row->shares,
            ])->values(),
        ]);
    }
}
