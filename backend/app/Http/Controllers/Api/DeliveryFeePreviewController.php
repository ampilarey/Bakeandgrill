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
    public function show(Request $request, DeliveryFeeCalculator $calculator, \App\Domains\Delivery\Services\DeliverySettingsService $settings): JsonResponse
    {
        $validated = $request->validate([
            'island' => ['required', 'string', 'max:100'],
            'subtotal_laar' => ['nullable', 'integer', 'min:0'],
        ]);

        $subtotalLaar = (int) ($validated['subtotal_laar'] ?? 0);
        $feeLaar = $calculator->calculateLaar($validated['island'], $subtotalLaar);
        $thresholdLaar = (int) round($calculator->freeThresholdMvr() * 100);
        $minLaar = (int) round($settings->minOrder() * 100);

        return response()->json([
            'fee_laar' => $feeLaar,
            'fee_mvr' => round($feeLaar / 100, 2),
            'free_threshold_mvr' => $calculator->freeThresholdMvr(),
            'qualifies_free' => $feeLaar === 0 && $thresholdLaar > 0 && $subtotalLaar >= $thresholdLaar,
            // Checkout audit, 2026-09-26: the delivery minimum, so checkout can
            // say how much more is needed before the customer taps Pay.
            'min_order_mvr' => round($minLaar / 100, 2),
            'below_minimum' => $minLaar > 0 && $subtotalLaar < $minLaar,
            'short_by_laar' => max(0, $minLaar - $subtotalLaar),
        ]);
    }
}
