<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET|POST /api/ordering/checkout-fees-preview
 *
 * Public preview for packaging + small-order fees so online checkout matches server totals.
 * Packaging is per-item × qty; pass cart `lines` so the fee can be computed without a saved order.
 */
class CheckoutFeesPreviewController extends Controller
{
    public function show(Request $request, PackagingFeeCalculator $calculator): JsonResponse
    {
        $validated = $request->validate([
            'order_type' => ['required', 'string', 'in:delivery,online_pickup,takeaway,dine_in'],
            'discounted_subtotal_laar' => ['required', 'integer', 'min:0'],
            'lines' => ['sometimes', 'nullable', 'array'],
            'lines.*.item_id' => ['required_with:lines', 'integer', 'min:1'],
            'lines.*.quantity' => ['required_with:lines', 'numeric', 'min:0'],
            'lines.*.packaging_option_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'lines.*.packaging_fee' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'lines.*.packaging_fee_mode' => ['sometimes', 'nullable', 'string', 'in:per_unit,per_line'],
        ]);

        $lines = is_array($validated['lines'] ?? null) ? $validated['lines'] : [];

        $fees = $calculator->previewCheckoutFees(
            $validated['order_type'],
            (int) $validated['discounted_subtotal_laar'],
            $lines,
        );

        return response()->json($fees);
    }
}
