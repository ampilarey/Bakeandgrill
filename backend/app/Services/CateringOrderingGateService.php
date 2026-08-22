<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SiteSetting;
use App\Support\ScheduleWindows;
use Carbon\Carbon;

/**
 * Decides whether customer pre-order / event requests are currently accepted.
 *
 * Same three-layer model as OnlineOrderingGateService:
 *  1. Override       — catering_ordering_override_until future → force open
 *  2. Master switch  — catering_ordering_enabled = false → closed
 *  3. Schedule       — catering_ordering_schedule; empty → always open when enabled
 *
 * Admin catering tools and existing event quotes are not gated here —
 * only new customer event draft creation (POST /customer/event-orders).
 */
class CateringOrderingGateService
{
    public function isOpen(?Carbon $at = null): bool
    {
        return $this->evaluate($at)->allowed;
    }

    public function closedMessage(): string
    {
        return (string) SiteSetting::get(
            'catering_ordering_closed_message',
            'Pre-order is currently closed. Please check back during accepting hours.',
        );
    }

    public function assertOpen(?Carbon $at = null): void
    {
        $result = $this->evaluate($at);
        if (!$result->allowed) {
            abort(422, $result->message);
        }
    }

    /** @return array<string, mixed> */
    public function status(?Carbon $at = null): array
    {
        $result = $this->evaluate($at);
        $masterOn = $this->masterSwitchOn();
        $overrideActive = $this->overrideIsActive($at);
        $schedule = $this->parseSchedule();
        $overrideUntil = SiteSetting::get('catering_ordering_override_until');

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
            'open' => $result->allowed,
            'message' => $result->allowed ? '' : ($result->message ?: $this->closedMessage()),
            'reason' => $reason,
            'master_switch' => $masterOn,
            'override_until' => $overrideUntil,
            'override_active' => $overrideActive,
            'schedule_active' => $schedule !== null,
            'current_close' => $result->allowed ? $this->currentWindowClose($schedule, $at) : null,
            'next_open_window' => !$result->allowed && $schedule ? $this->nextOpenWindow($schedule, $at) : null,
        ];
    }

    private function evaluate(?Carbon $at): GateResult
    {
        $at ??= now();

        if ($this->overrideIsActive($at)) {
            return GateResult::open();
        }

        if (!$this->masterSwitchOn()) {
            return GateResult::closed($this->closedMessage());
        }

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
        $raw = SiteSetting::get('catering_ordering_enabled', '1');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? ($raw === '1' || $raw === 1);
    }

    private function overrideIsActive(?Carbon $at): bool
    {
        $raw = SiteSetting::get('catering_ordering_override_until');
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
     * @return array<string, list<array{open: string, close: string}>>|null
     */
    private function parseSchedule(): ?array
    {
        $raw = SiteSetting::get('catering_ordering_schedule');
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
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    private function withinSchedule(array $schedule, Carbon $at): bool
    {
        $tz = config('app.timezone', 'UTC');

        return ScheduleWindows::within($schedule, $at);
    }

    /**
     * @param array<string, list<array{open: string, close: string}>>|null $schedule
     */
    private function currentWindowClose(?array $schedule, ?Carbon $at): ?string
    {
        if ($schedule === null) {
            return null;
        }

        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);

        return ScheduleWindows::activeClose($schedule, $now)?->toIso8601String();
    }

    /**
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    private function nextOpenWindow(array $schedule, ?Carbon $at): ?string
    {
        $tz = config('app.timezone', 'UTC');
        $now = ($at ?? now())->clone()->setTimezone($tz);

        return ScheduleWindows::nextOpen($schedule, $now)?->toIso8601String();
    }
}
