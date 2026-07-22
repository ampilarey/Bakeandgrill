<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ProcurementAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProcurementReportController extends Controller
{
    public function __construct(private readonly ProcurementAnalyticsService $analytics) {}

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
        ]);

        return response()->json(
            $this->analytics->report(
                $validated['from'] ?? null,
                $validated['to'] ?? null,
                isset($validated['inventory_item_id']) ? (int) $validated['inventory_item_id'] : null,
            ),
        );
    }
}
