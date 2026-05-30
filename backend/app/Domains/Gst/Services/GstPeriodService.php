<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Models\GstPeriodLock;
use App\Models\GstSetting;
use Carbon\Carbon;

class GstPeriodService
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
    ) {}

    public function periodKeyForDate(Carbon $date): string
    {
        $settings = $this->settings->get();

        if ($settings->taxable_period === 'quarterly') {
            $quarter = (int) ceil($date->month / 3);

            return sprintf('%d-Q%d', $date->year, $quarter);
        }

        return $date->format('Y-m');
    }

    public function isLocked(string $periodKey): bool
    {
        return GstPeriodLock::query()->where('period_key', $periodKey)->exists();
    }

    public function lock(string $periodKey, int $userId, int $carryForwardInputLaar = 0): GstPeriodLock
    {
        return GstPeriodLock::query()->updateOrCreate(
            ['period_key' => $periodKey],
            [
                'locked_at' => now(),
                'locked_by' => $userId,
                'carry_forward_input_laar' => $carryForwardInputLaar,
            ],
        );
    }

    public function nextOpenPeriodKey(?string $fromPeriod = null): string
    {
        $start = $fromPeriod
            ? $this->periodStartDate($fromPeriod)->addMonth()
            : now()->startOfMonth();

        $settings = $this->settings->get();
        $cursor = $start->copy();

        for ($i = 0; $i < 24; $i++) {
            $key = $this->periodKeyForDate($cursor);
            if (!$this->isLocked($key)) {
                return $key;
            }
            $cursor = $settings->taxable_period === 'quarterly'
                ? $cursor->addMonths(3)
                : $cursor->addMonth();
        }

        return $this->periodKeyForDate(now());
    }

    public function periodStartDate(string $periodKey): Carbon
    {
        if (preg_match('/^(\d{4})-Q(\d)$/', $periodKey, $m)) {
            $month = ((int) $m[2] - 1) * 3 + 1;

            return Carbon::create((int) $m[1], $month, 1)->startOfDay();
        }

        return Carbon::createFromFormat('Y-m', $periodKey)->startOfMonth();
    }

    public function periodEndDate(string $periodKey): Carbon
    {
        if (preg_match('/^(\d{4})-Q(\d)$/', $periodKey, $m)) {
            $month = (int) $m[2] * 3;

            return Carbon::create((int) $m[1], $month, 1)->endOfMonth()->endOfDay();
        }

        return Carbon::createFromFormat('Y-m', $periodKey)->endOfMonth()->endOfDay();
    }

    public function carryForwardInputLaar(string $periodKey): int
    {
        $settings = $this->settings->get();
        $prev = $this->previousPeriodKey($periodKey, $settings);

        if ($prev === null) {
            return 0;
        }

        return (int) (GstPeriodLock::query()->where('period_key', $prev)->value('carry_forward_input_laar') ?? 0);
    }

    private function previousPeriodKey(string $periodKey, GstSetting $settings): ?string
    {
        $start = $this->periodStartDate($periodKey);

        if ($settings->taxable_period === 'quarterly') {
            return $this->periodKeyForDate($start->copy()->subMonths(3));
        }

        return $this->periodKeyForDate($start->copy()->subMonth());
    }
}
