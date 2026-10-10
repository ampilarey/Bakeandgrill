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
            // When each alert sends; whether it sends is its row's switch in
            // Admin → Notifications (2026-10-10), so 0 no longer means off.
            'shift_open_alert_hours' => 'sometimes|integer|min:1|max:72',
            'shift_variance_alert_mvr' => 'sometimes|numeric|min:1|max:1000000',
            'unstarted_order_alert_minutes' => 'sometimes|integer|min:1|max:120',
        ]);

        return response()->json([
            'settings' => $ops->updateSettings($validated),
            'message' => 'Operations alert settings saved.',
        ]);
    }
}
