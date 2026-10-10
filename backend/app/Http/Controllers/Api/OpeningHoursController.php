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

        if (!$open) {
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
     * Full weekly schedule, keyed by day name, for the order app's Hours page.
     *
     * UI audit, 2026-10-10: this sent the built-in config hours (not the
     * hours set in Admin) as a list numbered 0 to 6, and the page looks days
     * up by name, so every day read "Hours not available". It now sends the
     * same hours as the website's Hours page and the footer.
     */
    public function index(): JsonResponse
    {
        $names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        $hours = $this->service->getHoursForDisplay();
        $schedule = [];
        foreach ($names as $i => $name) {
            $row = $hours[$i] ?? null;
            $open = is_array($row) ? (string) ($row['open'] ?? '') : '';
            $close = is_array($row) ? (string) ($row['close'] ?? '') : '';
            $closed = !is_array($row) || (bool) ($row['closed'] ?? false) || $open === '' || $close === '';
            $schedule[$name] = $closed
                ? ['closed' => true, 'open' => null, 'close' => null]
                : ['closed' => false, 'open' => $open, 'close' => $close];
        }

        return response()->json([
            'schedule' => $schedule,
            'open' => $this->service->isOpenNow(),
            'closure_reason' => $this->service->getClosureReason(),
        ]);
    }
}
