<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Marketing\Services\ItemAffinityService;
use App\Domains\Marketing\Services\SuggestionTracker;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    /**
     * Record that suggestions were shown, or that one was taken.
     *
     * Fire-and-forget from the client's point of view: a failed tally must
     * never block a customer from adding something to their cart, so this
     * answers 202 and keeps its own errors to itself.
     */
    public function track(Request $request, SuggestionTracker $tracker): JsonResponse
    {
        $validated = $request->validate([
            'surface' => ['required', 'string', Rule::in(SuggestionTracker::SURFACES)],
            'action' => ['required', 'string', Rule::in(SuggestionTracker::ACTIONS)],
            'item_ids' => 'required|array|min:1|max:20',
            'item_ids.*' => 'integer|min:1',
        ]);

        $recorded = $tracker->record(
            $validated['surface'],
            $validated['action'],
            $validated['item_ids'],
        );

        return response()->json(['recorded' => $recorded], 202);
    }
}
