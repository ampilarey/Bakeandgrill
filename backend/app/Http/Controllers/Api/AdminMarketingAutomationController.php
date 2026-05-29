<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Marketing\Services\MarketingAutomationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminMarketingAutomationController extends Controller
{
    public function show(MarketingAutomationService $marketing): JsonResponse
    {
        return response()->json(['settings' => $marketing->settings()]);
    }

    public function update(Request $request, MarketingAutomationService $marketing): JsonResponse
    {
        $validated = $request->validate([
            'birthday_enabled' => 'sometimes|boolean',
            'birthday_points' => 'sometimes|integer|min:0|max:10000',
            'birthday_sms_template' => 'sometimes|string|max:500',
            'abandoned_cart_enabled' => 'sometimes|boolean',
            'abandoned_cart_delay_minutes' => 'sometimes|integer|min:15|max:10080',
            'abandoned_cart_sms_template' => 'sometimes|string|max:500',
            'abandoned_cart_ttl_days' => 'sometimes|integer|min:1|max:90',
            'tier_milestone_enabled' => 'sometimes|boolean',
            'tier_milestone_within' => 'sometimes|integer|min:10|max:5000',
            'tier_milestone_sms_template' => 'sometimes|string|max:500',
        ]);

        return response()->json([
            'settings' => $marketing->updateSettings($validated),
            'message' => 'Marketing automation settings saved.',
        ]);
    }
}
