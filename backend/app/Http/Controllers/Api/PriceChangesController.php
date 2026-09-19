<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PriceChangesService;
use Illuminate\Http\JsonResponse;

/**
 * Purchasing → Price changes (owner, 2026-09-19): what each thing we buy
 * costs now against before, and one item's full price line.
 */
class PriceChangesController extends Controller
{
    public function __construct(private readonly PriceChangesService $prices) {}

    /** GET /purchasing/price-changes */
    public function index(): JsonResponse
    {
        return response()->json($this->prices->list());
    }

    /** GET /purchasing/price-changes/{itemId} */
    public function show(int $itemId): JsonResponse
    {
        $history = $this->prices->history($itemId);
        if ($history['item'] === null) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json($history);
    }
}
