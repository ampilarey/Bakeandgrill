<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OpeningHoursService;
use Illuminate\Http\JsonResponse;

class OpeningHoursController extends Controller
{
    public function __construct(private readonly OpeningHoursService $service) {}

    /**
     * Current open/closed status with today's hours.
     * Used by the online-order app to gate ordering.
     */
    public function status(): JsonResponse
    {
        $open = $this->service->isOpenNow();
        $message = null;

        if (! $open) {
            $message = $this->service->getClosureReason()
                ?? config('opening_hours.closed_message', 'We are currently closed. Please check our opening hours.');
        }

        $todayRow = $this->service->getTodayHours();
        $today = null;

        if ($todayRow !== null) {
            $closed = (bool) ($todayRow['closed'] ?? false);
            $today = [
                'closed' => $closed,
                'open' => $closed ? null : ($todayRow['open'] ?? null),
                'close' => $closed ? null : ($todayRow['close'] ?? null),
            ];
        }

        return response()->json(['open' => $open, 'message' => $message, 'today' => $today]);
    }

    /**
     * Full weekly schedule.
     * Used by the HoursPage in the React app.
     */
    public function index(): JsonResponse
    {
        $schedule = config('opening_hours.hours', []);

        return response()->json([
            'schedule' => $schedule,
            'open' => $this->service->isOpenNow(),
            'closure_reason' => $this->service->getClosureReason(),
        ]);
    }
}
