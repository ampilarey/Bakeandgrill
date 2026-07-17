<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseExpenseSettingsController extends Controller
{
    public function show(NonStockPurchaseExpenseService $service): JsonResponse
    {
        return response()->json(['settings' => $service->settings()]);
    }

    public function update(Request $request, NonStockPurchaseExpenseService $service): JsonResponse
    {
        $validated = $request->validate([
            'auto_expense_non_stock_purchases' => 'sometimes|boolean',
        ]);

        return response()->json([
            'settings' => $service->updateSettings($validated),
            'message' => 'Purchase expense settings saved.',
        ]);
    }
}
