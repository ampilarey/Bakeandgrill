<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SiteSetting;
use App\Support\ScheduleWindows;
use Carbon\Carbon;

/**
 * Generic three-layer gate for online ordering features — the same model the
 * master / delivery / catering gates use, without a fourth copy of the logic:
 *
 *   1. Override      — {key}_override_until in the future → force open
 *   2. Kill switch   — {key}_enabled = false → closed
 *   3. Schedule      — {key}_schedule per-day windows; empty = always open
 *
 * Gates (setting-key prefixes) are allow-listed in GATES so the admin API
 * cannot be pointed at arbitrary settings.
 */
class FeatureGateService
{
    /** @var array<string, array{label: string, description: string, default_enabled: bool}> */
    public const GATES = [
        'order_for_tomorrow' => [
            'label' => 'Order for tomorrow',
            'description' => 'Customers can order ticked items today and collect tomorrow. Turn off when the kitchen cannot take advance orders (e.g. staff shortage).',
            'default_enabled' => true,
        ],
        'dine_in_preorder' => [
            'label' => 'Today — eat here',
            'description' => 'Customers order and pay online, get a reserved table, and eat in. Schedule limits when new eat-here orders are accepted.',
            'default_enabled' => false,
        ],
        'reservations' => [
            'label' => 'Table reservations',
            'description' => 'Customers can book a table online. Turn off to stop accepting new bookings (existing bookings are unaffected).',
            'default_enabled' => true,
        ],
        'gift_card_purchase' => [
            'label' => 'Gift card purchase',
            'description' => 'Customers can buy gift cards online. Turn off during payment gateway problems.',
            'default_enabled' => true,
        ],
        'pickup_ordering' => [
            'label' => 'Today — pickup',
            'description' => 'Customers can place same-day pickup orders. Schedule limits pickup hours independently of the master online-ordering hours.',
            'default_enabled' => true,
        ],
        'tomorrow_pickup' => [
            'label' => 'Tomorrow — pickup',
            'description' => 'Customers can order today and collect tomorrow. Needs the "Order for tomorrow" master switch on as well.',
            'default_enabled' => true,
        ],
        'tomorrow_delivery' => [
            'label' => 'Tomorrow — delivery',
            'description' => 'Customers can order today for delivery tomorrow. Needs the master switch on. Turn off when no drivers are arranged for tomorrow.',
            'default_enabled' => true,
        ],
        'tomorrow_dine_in' => [
            'label' => 'Tomorrow — eat here',
            'description' => 'Customers can book an eat-here order for tomorrow. Off by default; also requires the "Eat here" gate to be on.',
            'default_enabled' => false,
        ],
    ];

    public function isKnown(string $key): bool
    {
        return array_key_exists($key, self::GATES);
    }

    public function enabled(string $key): bool
    {
        $default = (self::GATES[$key]['default_enabled'] ?? false) ? '1' : '0';
        $raw = SiteSetting::get("{$key}_enabled", $default);

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            ?? ($raw === '1' || $raw === 1);
    }

    public function open(string $key, ?Carbon $at = null): bool
    {
        $at ??= now();

        if ($this->overrideActive($key, $at)) {
            return true;
        }

        if (!$this->enabled($key)) {
            return false;
        }

        $schedule = ScheduleWindows::parse(SiteSetting::get("{$key}_schedule"));
        if ($schedule === null) {
            return true;
        }

        return ScheduleWindows::within($schedule, $at);
    }

    /** Abort 422 with a plain message when the gate is closed. */
    public function assertOpen(string $key, string $closedMessage, ?Carbon $at = null): void
    {
        if (!$this->open($key, $at)) {
            abort(422, $closedMessage);
        }
    }

    /** @return array{key: string, label: string, description: string, enabled: bool, open: bool, schedule: mixed, override_until: ?string} */
    public function status(string $key, ?Carbon $at = null): array
    {
        $scheduleRaw = SiteSetting::get("{$key}_schedule");
        $decoded = null;
        if (is_string($scheduleRaw) && $scheduleRaw !== '') {
            $decoded = json_decode($scheduleRaw, true);
        }

        return [
            'key' => $key,
            'label' => self::GATES[$key]['label'] ?? $key,
            'description' => self::GATES[$key]['description'] ?? '',
            'enabled' => $this->enabled($key),
            'open' => $this->open($key, $at),
            'schedule' => is_array($decoded) ? $decoded : null,
            'override_until' => SiteSetting::get("{$key}_override_until") ?: null,
        ];
    }

    /** @return array<string, array<string, mixed>> */
    public function allStatuses(?Carbon $at = null): array
    {
        $out = [];
        foreach (array_keys(self::GATES) as $key) {
            $out[$key] = $this->status($key, $at);
        }

        return $out;
    }

    private function overrideActive(string $key, Carbon $at): bool
    {
        $raw = SiteSetting::get("{$key}_override_until");
        if (!$raw) {
            return false;
        }

        try {
            return $at->lt(Carbon::parse($raw, config('app.timezone', 'UTC')));
        } catch (\Throwable) {
            return false;
        }
    }
}
