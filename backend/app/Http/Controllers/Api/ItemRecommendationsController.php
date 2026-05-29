<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Marketing\Services\ItemAffinityService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemRecommendationsController extends Controller
{
    public function forCart(Request $request, ItemAffinityService $affinity): JsonResponse
    {
        $validated = $request->validate([
            'item_ids' => 'required|array|min:1|max:20',
            'item_ids.*' => 'integer|min:1',
            'limit' => 'sometimes|integer|min:1|max:6',
        ]);

        $items = $affinity->recommendationsForCart(
            $validated['item_ids'],
            (int) ($validated['limit'] ?? 3),
        );

        return response()->json(['items' => $items]);
    }
}
