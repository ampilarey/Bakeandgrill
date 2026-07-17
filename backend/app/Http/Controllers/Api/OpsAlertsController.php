<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Operations\Services\OpsAlertsService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OpsAlertsController extends Controller
{
    public function show(OpsAlertsService $ops): JsonResponse
    {
        return response()->json(['settings' => $ops->settings()]);
    }

    public function update(Request $request, OpsAlertsService $ops): JsonResponse
    {
        $validated = $request->validate([
            'delivery_delay_alert_sms' => 'sometimes|boolean',
            'inventory_reorder_alert_sms' => 'sometimes|boolean',
        ]);

        return response()->json([
            'settings' => $ops->updateSettings($validated),
            'message' => 'Operations alert settings saved.',
        ]);
    }
}
