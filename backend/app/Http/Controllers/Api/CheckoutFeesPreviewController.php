<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/ordering/checkout-fees-preview
 *
 * Public preview for packaging + small-order fees so online checkout matches server totals.
 */
class CheckoutFeesPreviewController extends Controller
{
    public function show(Request $request, PackagingFeeCalculator $calculator): JsonResponse
    {
        $validated = $request->validate([
            'order_type' => ['required', 'string', 'in:delivery,online_pickup'],
            'discounted_subtotal_laar' => ['required', 'integer', 'min:0'],
        ]);

        $fees = $calculator->previewCheckoutFees(
            $validated['order_type'],
            (int) $validated['discounted_subtotal_laar'],
        );

        return response()->json($fees);
    }
}
