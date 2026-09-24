<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SmsPromotion;
use Illuminate\Http\JsonResponse;

/**
 * SMS blasts (SMS audit, 2026-09-24): history only. Sending moved to
 * Campaigns, which has the audience builder, A/B, scheduling, the shared
 * daily recipient cap and the same log. The two systems used to run side
 * by side with separate caps, so one could not see what the other sent.
 */
class SmsPromotionController extends Controller
{
    public function index(): JsonResponse
    {
        $promotions = SmsPromotion::withCount('recipients')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json(['promotions' => $promotions]);
    }

    public function show($id): JsonResponse
    {
        $promotion = SmsPromotion::with('recipients')
            ->findOrFail($id);

        return response()->json(['promotion' => $promotion]);
    }

    public function preview(): JsonResponse
    {
        return $this->gone();
    }

    public function send(): JsonResponse
    {
        return $this->gone();
    }

    private function gone(): JsonResponse
    {
        return response()->json([
            'message' => 'SMS blasts now go out as campaigns. Open SMS → Campaigns: build the audience there, preview it, send a test to yourself, then send or schedule.',
            'moved_to' => '/admin/sms/campaigns',
        ], 410);
    }
}
