<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/ordering/delivery-fee-preview?island=Male&subtotal_laar=5000
 *
 * Public preview so online checkout matches server-side DeliveryFeeCalculator.
 */
class DeliveryFeePreviewController extends Controller
{
    public function show(Request $request, DeliveryFeeCalculator $calculator): JsonResponse
    {
        $validated = $request->validate([
            'island' => ['required', 'string', 'max:100'],
            'subtotal_laar' => ['nullable', 'integer', 'min:0'],
        ]);

        $subtotalLaar = (int) ($validated['subtotal_laar'] ?? 0);
        $feeLaar = $calculator->calculateLaar($validated['island'], $subtotalLaar);
        $thresholdLaar = (int) round($calculator->freeThresholdMvr() * 100);

        return response()->json([
            'fee_laar' => $feeLaar,
            'fee_mvr' => round($feeLaar / 100, 2),
            'free_threshold_mvr' => $calculator->freeThresholdMvr(),
            'qualifies_free' => $feeLaar === 0 && $thresholdLaar > 0 && $subtotalLaar >= $thresholdLaar,
        ]);
    }
}
