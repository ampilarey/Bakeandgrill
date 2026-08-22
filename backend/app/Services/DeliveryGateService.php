<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Delivery\Services\DeliverySettingsService;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Support\ScheduleWindows;
use Carbon\Carbon;

/**
 * Delivery-specific availability gate.
 *
 * Evaluation order (all must pass unless force-open override):
 *  0. delivery_override_until — force open (skips remaining layers)
 *  1. delivery_accepting_orders flag
 *  2. delivery_schedule window (if configured)
 *  3. delivery_zones whitelist (if configured and area provided)
 *  4. delivery_max_active_orders capacity (if > 0)
 *
 * The general OnlineOrderingGateService runs before this in DeliveryOrderController.
 */
class DeliveryGateService
{
    public function __construct(
        private readonly DeliverySettingsService $deliverySettings,
    ) {}

    public function assertDeliveryOpen(?string $deliveryArea = null, ?Carbon $at = null): void
    {
        $result = $this->evaluate($deliveryArea, $at, checkCapacity: true);
        if (!$result->allowed) {
            abort(422, $result->message);
        }
    }

    /**
     * Gate for collect-tomorrow delivery orders. Today's schedule window and
     * capacity don't apply — a driver is arranged in advance — but the owner
     * accepting kill-switch and the zone whitelist still do.
     */
    public function assertDeliveryOpenForTomorrow(?string $deliveryArea = null, ?Carbon $at = null): void
    {
        if ($this->isOverrideActive($at)) {
            return;
        }

        if (!$this->acceptingFlagOn()) {
            abort(422, (string) SiteSetting::get(
                'delivery_unavailable_message',
                'Delivery is not available right now. Please try takeaway or check back later.',
            ));
        }

        if ($deliveryArea !== null) {
            $zones = $this->parseZones();
            if ($zones !== null && !in_array(strtolower(trim($deliveryArea)), $zones, true)) {
                abort(422, "Sorry, we don't deliver to {$deliveryArea} yet.");
            }
        }
    }

    /**
     * @param bool $checkCapacity When false, skips max-active check (menu visibility /
     *                            mid-create line asserts — order shell may already exist).
     */
    public function isDeliveryOpen(?string $deliveryArea = null, ?Carbon $at = null, bool $checkCapacity = true): bool
    {
        return $this->evaluate($deliveryArea, $at, $checkCapacity)->allowed;
    }

    public function status(?string $deliveryArea = null, ?Carbon $at = null): array
    {
        $result = $this->evaluate($deliveryArea, $at, checkCapacity: true);
        $schedule = $this->parseSchedule();
        $overrideUntil = SiteSetting::get('delivery_override_until');
        $overrideActive = $this->isOverrideActive($at);
        $zones = $this->parseZones();
        $maxActive = $this->maxActiveOrders();
        $activeCount = $this->activeDeliveryOrderCount();
        $freeThreshold = $this->deliverySettings->freeThreshold();

        $zoneEligible = null;
        if ($deliveryArea !== null) {
            $zoneEligible = $zones === null
                || in_array(strtolower(trim($deliveryArea)), $zones, true);
        }

        return [
            'delivery_open' => $result->allowed,
            // Checkout aliases (non-breaking)
            'accepting' => $result->allowed,
            'zone_eligible' => $zoneEligible,
            'reason' => $result->allowed ? null : $result->reasonCode,
            'message' => $result->allowed ? null : $result->message,
            'accepting_flag' => $this->acceptingFlagOn(),
            'schedule_active' => $schedule !== null,
            'delivery_schedule' => $this->rawSchedulePayload(),
            'zones_enforced' => $zones !== null,
            'next_delivery_window' => $schedule ? $this->nextWindow($schedule, $at) : null,
            'free_delivery_threshold' => $freeThreshold > 0 ? $freeThreshold : null,
            'override_active' => $overrideActive,
            'override_until' => $overrideUntil ?: null,
            'max_active_orders' => $maxActive,
            'active_delivery_orders' => $activeCount,
            'capacity_enforced' => $maxActive > 0,
        ];
    }

    public function isOverrideActive(?Carbon $at = null): bool
    {
        $raw = SiteSetting::get('delivery_override_until');
        if (!$raw) {
            return false;
        }
        try {
            $until = Carbon::parse($raw, config('app.timezone', 'UTC'));

            return ($at ?? now())->lt($until);
        } catch (\Throwable) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Private
    // ------------------------------------------------------------------

    private function evaluate(?string $deliveryArea, ?Carbon $at, bool $checkCapacity = true): DeliveryGateResult
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
                'accepting_off',
            );
        }

        // Layer 2: schedule
        $schedule = $this->parseSchedule();
        if ($schedule !== null && !$this->withinSchedule($schedule, $at)) {
            return DeliveryGateResult::closed(
                'Delivery is not available at this time. Please check our delivery hours.',
                'schedule',
            );
        }

        // Layer 3: zone
        if ($deliveryArea !== null) {
            $zones = $this->parseZones();
            if ($zones !== null && !in_array(strtolower(trim($deliveryArea)), $zones, true)) {
                return DeliveryGateResult::closed(
                    "Sorry, we don't deliver to {$deliveryArea} yet.",
                    'zone',
                );
            }
        }

        // Layer 4: capacity — only on order accept (assertDeliveryOpen / status).
        // Menu visibility and mid-create line checks skip this: OrderCreationService
        // inserts the order row before addOrderItems, which would otherwise count
        // the new ticket against the cap and false-reject.
        if ($checkCapacity) {
            $maxActive = $this->maxActiveOrders();
            if ($maxActive > 0) {
                $active = $this->activeDeliveryOrderCount();
                if ($active >= $maxActive) {
                    return DeliveryGateResult::closed(
                        'Delivery is at capacity right now. Please try takeaway or check back shortly.',
                        'capacity',
                    );
                }
            }
        }

        return DeliveryGateResult::open();
    }

    public function maxActiveOrders(): int
    {
        $raw = SiteSetting::get('delivery_max_active_orders', '0');

        return max(0, min(500, (int) $raw));
    }

    public function activeDeliveryOrderCount(): int
    {
        return (int) Order::query()
            ->where('type', 'delivery')
            ->whereNotIn('status', [
                'delivered',
                'completed',
                'cancelled',
                'refunded',
                'partially_refunded',
            ])
            ->count();
    }

    /** Raw schedule JSON for admin editor hydration (null when unset). */
    public function rawSchedulePayload(): mixed
    {
        $raw = SiteSetting::get('delivery_schedule');
        if (!$raw) {
            return null;
        }
        try {
            return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
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

        return ScheduleWindows::within($schedule, $now);
    }

    private function nextWindow(array $schedule, ?Carbon $at): ?string
    {
        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);

        return ScheduleWindows::nextOpen($schedule, $now)?->toIso8601String();
    }
}

/** @internal */
final class DeliveryGateResult
{
    private function __construct(
        public readonly bool $allowed,
        public readonly string $message,
        public readonly ?string $reasonCode = null,
    ) {}

    public static function open(): self
    {
        return new self(true, '', null);
    }

    public static function closed(string $message, ?string $reasonCode = null): self
    {
        return new self(false, $message, $reasonCode);
    }
}
