<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SiteSetting;
use Carbon\Carbon;

/**
 * Decides whether the online ordering channel is currently open.
 *
 * Three-layer evaluation (highest priority first):
 *  1. Override       — online_ordering_override_until is a future datetime → force open
 *  2. Master switch  — online_ordering_enabled = false → closed (unless override)
 *  3. Schedule       — online_ordering_schedule defines per-day windows; if empty → always open
 *
 * POS / staff orders are NEVER gated by this service.
 * Only customer-facing endpoints call this: online_pickup and customer delivery.
 */
class OnlineOrderingGateService
{
    public function isOpen(?Carbon $at = null): bool
    {
        return $this->evaluate($at)->allowed;
    }

    public function closedMessage(): string
    {
        return (string) SiteSetting::get(
            'online_ordering_closed_message',
            'Online ordering is currently closed.',
        );
    }

    /** Abort with 422 if online ordering is closed. Call at the start of customer order endpoints. */
    public function assertOpen(?Carbon $at = null): void
    {
        $result = $this->evaluate($at);
        if (!$result->allowed) {
            abort(422, $result->message);
        }
    }

    /**
     * Same-day customer orders still require the shop open.
     * Collect-tomorrow orders (fulfil_date already server-resolved) may proceed
     * while closed when every line was validated as allow_pre_order.
     */
    public function assertOpenOrTomorrowCollect(?string $fulfilDate, ?Carbon $at = null): void
    {
        if ($this->isOpen($at)) {
            return;
        }

        if ($fulfilDate === null || $fulfilDate === '') {
            abort(422, $this->evaluate($at)->message ?: $this->closedMessage());
        }

        $allowed = app(OrderFulfilDateService::class)->allowedTomorrowDateString($at);
        if ($fulfilDate !== $allowed) {
            abort(422, $this->closedMessage());
        }
        // Items already validated by the caller via assertAllItemsAllowTomorrow.
    }

    /** Returns a structured result suitable for the public status endpoint. */
    public function status(?Carbon $at = null): array
    {
        $result = $this->evaluate($at);
        $masterOn = $this->masterSwitchOn();
        $overrideActive = $this->overrideIsActive($at);
        $schedule = $this->parseSchedule();
        $overrideUntil = SiteSetting::get('online_ordering_override_until');

        // Reason reflects why the gate is in its current state (not layer order).
        $reason = null;
        if ($result->allowed) {
            if ($overrideActive) {
                $reason = 'override_active';
            }
        } elseif (!$masterOn && !$overrideActive) {
            $reason = 'master_switch_off';
        } elseif ($schedule && !$this->withinSchedule($schedule, $at ?? now())) {
            $reason = 'schedule';
        }

        return [
            // 'open' is the canonical key read by both the order app and admin UI
            'open' => $result->allowed,
            'message' => $result->allowed ? '' : ($result->message ?: $this->closedMessage()),
            'reason' => $reason,
            'master_switch' => $masterOn,
            'override_until' => $overrideUntil,
            'override_active' => $overrideActive,
            'schedule_active' => $schedule !== null,
            // When open: ISO 8601 end of the current window so the badge can show "Closes X:XX PM"
            'current_close' => $result->allowed ? $this->currentWindowClose($schedule, $at) : null,
            // When closed: ISO 8601 start of the next window so the badge can show "Opens X:XX PM"
            'next_open_window' => !$result->allowed && $schedule ? $this->nextOpenWindow($schedule, $at) : null,
        ];
    }

    // ------------------------------------------------------------------
    // Private evaluation logic
    // ------------------------------------------------------------------

    private function evaluate(?Carbon $at): GateResult
    {
        $at ??= now();

        // Layer 1 — manual override: force open until a future datetime.
        // Checked FIRST so it can override even a disabled master switch.
        if ($this->overrideIsActive($at)) {
            return GateResult::open();
        }

        // Layer 2 — master switch
        if (!$this->masterSwitchOn()) {
            return GateResult::closed($this->closedMessage());
        }

        // Layer 3 — schedule (null = no schedule = always open)
        $schedule = $this->parseSchedule();
        if ($schedule === null) {
            return GateResult::open();
        }

        if ($this->withinSchedule($schedule, $at)) {
            return GateResult::open();
        }

        return GateResult::closed($this->closedMessage());
    }

    private function masterSwitchOn(): bool
    {
        $raw = SiteSetting::get('online_ordering_enabled', '1');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? ($raw === '1' || $raw === 1);
    }

    private function overrideIsActive(?Carbon $at): bool
    {
        $raw = SiteSetting::get('online_ordering_override_until');
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

    /**
     * Parses the JSON schedule setting.
     *
     * Supports two formats per day:
     *   Single window: {"mon": {"open": "07:00", "close": "22:00", "enabled": true}}
     *   Multi window:  {"mon": [{"open": "11:00", "close": "15:00"}, {"open": "18:00", "close": "22:00"}]}
     *
     * Returns null when the setting is empty/invalid (= no schedule, always open).
     *
     * @return array<string, list<array{open: string, close: string}>>|null
     */
    private function parseSchedule(): ?array
    {
        $raw = SiteSetting::get('online_ordering_schedule');
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

        // Normalise every day value to a list of {open, close} windows.
        $normalised = [];
        foreach ($decoded as $day => $value) {
            if (!is_string($day) || !is_array($value)) {
                continue;
            }

            // New UI format: {"enabled": bool, "windows": [{"open":…,"close":…}, …]}
            if (isset($value['windows']) && is_array($value['windows'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue; // day explicitly disabled
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

            // Old single-window object: {"open":…,"close":…,"enabled":…}
            if (!empty($value['open']) && !empty($value['close'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue; // day explicitly disabled
                }
                $normalised[$day] = [['open' => $value['open'], 'close' => $value['close']]];
            }
        }

        return empty($normalised) ? null : $normalised;
    }

    /**
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    private function withinSchedule(array $schedule, Carbon $at): bool
    {
        $tz = config('app.timezone', 'UTC');
        $now = $at->clone()->setTimezone($tz);

        $dayKey = strtolower($now->format('D')); // mon, tue, …, sun

        $windows = $schedule[$dayKey] ?? null;
        if (!$windows) {
            return false; // day not listed = closed
        }

        foreach ($windows as $window) {
            try {
                $open = Carbon::createFromFormat('H:i', $window['open'], $tz)->setDateFrom($now);
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

    /**
     * Returns the ISO 8601 close time of whichever window is active right now,
     * or null if no window is currently active (ordering is closed or no schedule).
     *
     * @param array<string, list<array{open: string, close: string}>>|null $schedule
     */
    private function currentWindowClose(?array $schedule, ?Carbon $at): ?string
    {
        if ($schedule === null) {
            return null; // no schedule = always open, no close time
        }

        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);
        $dayKey = strtolower($now->format('D'));
        $windows = $schedule[$dayKey] ?? null;

        if (!$windows) {
            return null;
        }

        foreach ($windows as $window) {
            try {
                $open = Carbon::createFromFormat('H:i', $window['open'], $tz)->setDateFrom($now);
                $close = Carbon::createFromFormat('H:i', $window['close'], $tz)->setDateFrom($now);
            } catch (\Throwable) {
                continue;
            }

            if ($now->between($open, $close)) {
                return $close->toIso8601String();
            }
        }

        return null;
    }

    /**
     * Returns the next opening datetime string (ISO 8601) or null if it cannot
     * be determined (schedule not set, or no open day found within 7 days).
     *
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    private function nextOpenWindow(array $schedule, ?Carbon $at): ?string
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
                    $open = Carbon::createFromFormat('H:i', $window['open'], $tz)
                        ->setDateFrom($candidate);
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

/**
 * Simple value object — avoids passing two scalars through the call chain.
 *
 * @internal
 */
final class GateResult
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
