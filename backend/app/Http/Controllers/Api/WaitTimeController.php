<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\WaitTimeEstimator;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class WaitTimeController extends Controller
{
    /**
     * Admin → Settings → Ordering → Features → Order app: "Show the kitchen
     * wait time". Off by default (owner, 2026-10-12: "make off that from the
     * admin, maybe later turn on"). Off, the app gets an empty queue, which
     * is what hides the "~N min wait" pill on the menu, cart and checkout.
     */
    public const SETTING_KEY = 'order_app_wait_time_enabled';

    public function __construct(private readonly WaitTimeEstimator $estimator) {}

    public static function enabled(): bool
    {
        return filter_var(SiteSetting::get(self::SETTING_KEY, '0'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Returns the estimated current wait time in minutes,
     * based on open kitchen tickets and item prep times.
     */
    public function estimate(): JsonResponse
    {
        if (!self::enabled()) {
            return response()->json([
                'wait_minutes' => 0,
                'queue_depth' => 0,
                'enabled' => false,
            ]);
        }

        $result = $this->estimator->estimate();

        return response()->json([
            'wait_minutes' => $result['wait_minutes'],
            'queue_depth' => $result['queue_depth'],
            'enabled' => true,
        ]);
    }
}
