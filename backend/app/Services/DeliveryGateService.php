<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SiteSetting;
use Carbon\Carbon;

/**
 * Delivery-specific availability gate.
 *
 * Wraps the existing delivery_accepting_orders flag with two new layers:
 *  1. Delivery schedule — per-day hours separate from the general ordering schedule
 *  2. Zone check — optional whitelist of accepted delivery areas
 *
 * Evaluation order (all must pass):
 *  1. delivery_accepting_orders = 1  (existing flag, unchanged)
 *  2. Within delivery_schedule window (if schedule is configured)
 *  3. Delivery area in delivery_zones  (if zones are configured)
 *
 * The general OnlineOrderingGateService runs before this in DeliveryOrderController,
 * so callers only need to invoke this after the general gate has already passed.
 */
class DeliveryGateService
{
    public function assertDeliveryOpen(?string $deliveryArea = null, ?Carbon $at = null): void
    {
        $result = $this->evaluate($deliveryArea, $at);
        if (!$result->allowed) {
            abort(422, $result->message);
        }
    }

    public function isDeliveryOpen(?string $deliveryArea = null, ?Carbon $at = null): bool
    {
        return $this->evaluate($deliveryArea, $at)->allowed;
    }

    public function status(?string $deliveryArea = null, ?Carbon $at = null): array
    {
        $result = $this->evaluate($deliveryArea, $at);
        $schedule = $this->parseSchedule();
        $overrideUntil = SiteSetting::get('delivery_override_until');
        $overrideActive = $this->isOverrideActive($at);

        $freeThreshold = (float) config('delivery.free_threshold', 200.00);

        return [
            'delivery_open'          => $result->allowed,
            'message'                => $result->allowed ? null : $result->message,
            'accepting_flag'         => $this->acceptingFlagOn(),
            'schedule_active'        => $schedule !== null,
            'zones_enforced'         => $this->parseZones() !== null,
            'next_delivery_window'   => $schedule ? $this->nextWindow($schedule, $at) : null,
            'free_delivery_threshold'=> $freeThreshold > 0 ? $freeThreshold : null,
            'override_active'        => $overrideActive,
            'override_until'         => $overrideUntil ?: null,
        ];
    }

    public function isOverrideActive(?Carbon $at = null): bool
    {
        $raw = SiteSetting::get('delivery_override_until');
        if (!$raw) {
            return false;
        }
        try {
            $until = Carbon::parse($raw);
            return ($at ?? now())->lt($until);
        } catch (\Throwable) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Private
    // ------------------------------------------------------------------

    private function evaluate(?string $deliveryArea, ?Carbon $at): DeliveryGateResult
    {
        // Layer 0: force-open override
        if ($this->isOverrideActive($at)) {
            return DeliveryGateResult::open();
        }

        // Layer 1: existing flag
        if (!$this->acceptingFlagOn()) {
            return DeliveryGateResult::closed(
                (string) SiteSetting::get(
                    'delivery_unavailable_message',
                    'Delivery is not available right now. Please try takeaway or check back later.',
                ),
            );
        }

        // Layer 2: schedule
        $schedule = $this->parseSchedule();
        if ($schedule !== null && !$this->withinSchedule($schedule, $at)) {
            return DeliveryGateResult::closed(
                'Delivery is not available at this time. Please check our delivery hours.',
            );
        }

        // Layer 3: zone
        if ($deliveryArea !== null) {
            $zones = $this->parseZones();
            if ($zones !== null && !in_array(strtolower(trim($deliveryArea)), $zones, true)) {
                return DeliveryGateResult::closed(
                    "Sorry, we don't deliver to {$deliveryArea} yet.",
                );
            }
        }

        return DeliveryGateResult::open();
    }

    private function acceptingFlagOn(): bool
    {
        $raw = SiteSetting::get('delivery_accepting_orders', '1');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? ($raw === '1' || $raw === 1);
    }

    /**
     * Parses the JSON delivery schedule — identical multi-window format to OnlineOrderingGateService.
     *
     * Supports three formats per day:
     *   New UI format:    {"mon": {"enabled": true, "windows": [{"open":"11:00","close":"15:00"}, ...]}}
     *   Bare array:       {"mon": [{"open":"11:00","close":"15:00"}, ...]}
     *   Old single-window:{"mon": {"open":"11:00","close":"22:00","enabled":true}}
     *
     * @return array<string, list<array{open: string, close: string}>>|null
     */
    private function parseSchedule(): ?array
    {
        $raw = SiteSetting::get('delivery_schedule');
        if (!$raw) {
            return null;
        }
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (!is_array($decoded) || empty($decoded)) {
            return null;
        }

        $normalised = [];
        foreach ($decoded as $day => $value) {
            if (!is_string($day) || !is_array($value)) {
                continue;
            }

            // New UI format: {"enabled": bool, "windows": [...]}
            if (isset($value['windows']) && is_array($value['windows'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue;
                }
                $windows = [];
                foreach ($value['windows'] as $win) {
                    if (is_array($win) && !empty($win['open']) && !empty($win['close'])) {
                        $windows[] = ['open' => $win['open'], 'close' => $win['close']];
                    }
                }
                if (!empty($windows)) {
                    $normalised[$day] = $windows;
                }
                continue;
            }

            // Bare array of windows: [{"open":…,"close":…}, …]
            if (isset($value[0]) && is_array($value[0])) {
                $windows = [];
                foreach ($value as $win) {
                    if (!empty($win['open']) && !empty($win['close'])) {
                        $windows[] = ['open' => $win['open'], 'close' => $win['close']];
                    }
                }
                if (!empty($windows)) {
                    $normalised[$day] = $windows;
                }
                continue;
            }

            // Old single-window: {"open":…,"close":…,"enabled":…}
            if (!empty($value['open']) && !empty($value['close'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue;
                }
                $normalised[$day] = [['open' => $value['open'], 'close' => $value['close']]];
            }
        }

        return empty($normalised) ? null : $normalised;
    }

    /**
     * @return list<string>|null Lowercase zone slugs, or null if no zones configured
     */
    private function parseZones(): ?array
    {
        $raw = SiteSetting::get('delivery_zones');
        if (!$raw) {
            return null;
        }
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (!is_array($decoded) || empty($decoded)) {
            return null;
        }

        return array_map(fn ($z) => strtolower(trim((string) $z)), $decoded);
    }

    private function withinSchedule(array $schedule, ?Carbon $at): bool
    {
        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);
        $dayKey = strtolower($now->format('D'));
        $windows = $schedule[$dayKey] ?? null;

        if (!$windows) {
            return false;
        }

        foreach ($windows as $window) {
            try {
                $open  = Carbon::createFromFormat('H:i', $window['open'],  $tz)->setDateFrom($now);
                $close = Carbon::createFromFormat('H:i', $window['close'], $tz)->setDateFrom($now);
            } catch (\Throwable) {
                continue;
            }
            if ($now->between($open, $close)) {
                return true;
            }
        }

        return false;
    }

    private function nextWindow(array $schedule, ?Carbon $at): ?string
    {
        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);

        for ($i = 0; $i <= 7; $i++) {
            $candidate = $now->clone()->addDays($i);
            $dayKey = strtolower($candidate->format('D'));
            $windows = $schedule[$dayKey] ?? null;
            if (!$windows) {
                continue;
            }
            foreach ($windows as $window) {
                try {
                    $open = Carbon::createFromFormat('H:i', $window['open'], $tz)->setDateFrom($candidate);
                } catch (\Throwable) {
                    continue;
                }
                if ($i === 0 && $open->lte($now)) {
                    continue;
                }
                return $open->toIso8601String();
            }
        }

        return null;
    }
}

/** @internal */
final class DeliveryGateResult
{
    private function __construct(
        public readonly bool $allowed,
        public readonly string $message,
    ) {}

    public static function open(): self
    {
        return new self(true, '');
    }

    public static function closed(string $message): self
    {
        return new self(false, $message);
    }
}
