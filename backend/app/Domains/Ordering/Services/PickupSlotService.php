<?php

declare(strict_types=1);

namespace App\Domains\Ordering\Services;

use App\Models\Order;
use App\Models\SiteSetting;
use App\Services\OnlineOrderingGateService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

final class PickupSlotService
{
    public function __construct(
        private OnlineOrderingGateService $gate,
    ) {}

    /** @return list<array{starts_at: string, ends_at: string, label: string, available: bool, remaining: int}> */
    public function slotsForDate(string $date): array
    {
        if (!filter_var(SiteSetting::get('pickup_slots_enabled', '1'), FILTER_VALIDATE_BOOLEAN)) {
            return [];
        }

        $parsed = Carbon::parse($date)->startOfDay();
        if ($parsed->isPast() && !$parsed->isToday()) {
            return [];
        }
        if ($parsed->diffInDays(now()->startOfDay()) > 6) {
            return [];
        }

        $slotMinutes = max(15, min(120, (int) SiteSetting::get('pickup_slot_minutes', '30')));
        $capacity = max(1, min(50, (int) SiteSetting::get('pickup_slot_capacity', '8')));

        $windows = $this->openWindowsForDate($parsed);
        if ($windows === []) {
            return [];
        }

        $booked = Order::query()
            ->whereDate('pickup_slot_at', $parsed->toDateString())
            ->whereNotIn('status', ['cancelled'])
            ->whereNotNull('pickup_slot_at')
            ->selectRaw('pickup_slot_at, COUNT(*) as cnt')
            ->groupBy('pickup_slot_at')
            ->pluck('cnt', 'pickup_slot_at');

        $slots = [];
        foreach ($windows as [$open, $close]) {
            $cursor = $open->copy();
            while ($cursor->copy()->addMinutes($slotMinutes)->lte($close)) {
                $end = $cursor->copy()->addMinutes($slotMinutes);
                if ($parsed->isToday() && $cursor->lte(now()->addMinutes(15))) {
                    $cursor->addMinutes($slotMinutes);
                    continue;
                }

                $key = $cursor->toDateTimeString();
                $count = (int) ($booked[$key] ?? 0);
                $remaining = max(0, $capacity - $count);

                $slots[] = [
                    'starts_at' => $cursor->toIso8601String(),
                    'ends_at' => $end->toIso8601String(),
                    'label' => $cursor->format('g:i A') . ' – ' . $end->format('g:i A'),
                    'available' => $remaining > 0,
                    'remaining' => $remaining,
                ];

                $cursor->addMinutes($slotMinutes);
            }
        }

        return $slots;
    }

    public function assertSlotAvailable(string $isoStartsAt): void
    {
        if (!filter_var(SiteSetting::get('pickup_slots_enabled', '1'), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        $starts = Carbon::parse($isoStartsAt);
        $date = $starts->toDateString();
        $match = collect($this->slotsForDate($date))->first(
            fn (array $s) => Carbon::parse($s['starts_at'])->equalTo($starts)
        );

        if ($match === null || !($match['available'] ?? false)) {
            abort(422, 'That pickup time is no longer available. Please choose another slot.');
        }
    }

    /** @return list<array{0: Carbon, 1: Carbon}> */
    private function openWindowsForDate(Carbon $day): array
    {
        $status = Cache::remember(
            'pickup_gate_' . $day->toDateString(),
            now()->addMinutes(5),
            fn () => $this->gate->status(),
        );

        if (!($status['open'] ?? false)) {
            return [];
        }

        // Default Malé café hours if schedule not exposed per-day
        $open = $day->copy()->setTime(7, 0);
        $close = $day->copy()->setTime(22, 0);

        if (!empty($status['current_close'])) {
            try {
                $close = Carbon::parse($status['current_close']);
            } catch (\Throwable) {
                // keep default
            }
        }

        return [[$open, $close]];
    }
}
