<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SiteSetting;
use Carbon\Carbon;

class OpeningHoursService
{
    /**
     * Returns the weekly hours array, preferring the CMS setting over config.
     * Keys are integer day-of-week (0 = Sunday … 6 = Saturday).
     * Each value: ['open' => 'HH:MM', 'close' => 'HH:MM'] or ['closed' => true].
     */
    private function getHours(): array
    {
        $raw = SiteSetting::get('business_hours_json');
        if ($raw) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && count($decoded) > 0) {
                // JSON object keys are strings; cast to int for array-key compatibility.
                return array_combine(
                    array_map('intval', array_keys($decoded)),
                    array_values($decoded),
                );
            }
        }

        return config('opening_hours.hours', []);
    }

    /**
     * Returns the special closures map, preferring the CMS setting over config.
     * Format: ['YYYY-MM-DD' => 'Reason', ...].
     */
    private function getClosures(): array
    {
        $raw = SiteSetting::get('business_closures_json');
        if ($raw && $raw !== '{}') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return config('opening_hours.closures', []);
    }

    /**
     * Returns all seven days of hours for display on the /hours page.
     * Public wrapper around the private getHours() helper.
     */
    public function getHoursForDisplay(): array
    {
        return $this->getHours();
    }

    /**
     * Check if café is currently open.
     */
    public function isOpenNow(): bool
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $today = $now->dayOfWeek; // 0 = Sunday, 6 = Saturday
        $currentTime = $now->format('H:i');

        // Check special closures first.
        $closures = $this->getClosures();
        $dateString = $now->format('Y-m-d');
        if (isset($closures[$dateString])) {
            return false;
        }

        $hours = $this->getHours()[$today] ?? null;

        if (! $hours || ($hours['closed'] ?? false)) {
            return false;
        }

        $openTime = $hours['open'];
        $closeTime = $hours['close'];

        // Handle overnight hours (e.g. open 22:00, close 02:00 next day).
        if ($closeTime < $openTime) {
            return $currentTime >= $openTime || $currentTime < $closeTime;
        }

        return $currentTime >= $openTime && $currentTime < $closeTime;
    }

    /**
     * Get today's opening hours entry.
     */
    public function getTodayHours(): ?array
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $today = $now->dayOfWeek;

        return $this->getHours()[$today] ?? null;
    }

    /**
     * Get the next Carbon datetime when the café will open (within 7 days).
     */
    public function getNextOpenTime(): ?Carbon
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $hours = $this->getHours();

        for ($i = 0; $i < 7; $i++) {
            $checkDate = $now->copy()->addDays($i);
            $dayOfWeek = $checkDate->dayOfWeek;
            $dayHours = $hours[$dayOfWeek] ?? null;

            if (! $dayHours || ($dayHours['closed'] ?? false)) {
                continue;
            }

            $openTime = Carbon::parse($checkDate->format('Y-m-d').' '.$dayHours['open']);

            if ($openTime->isFuture()) {
                return $openTime;
            }
        }

        return null;
    }

    /**
     * Get closure reason for today (if any).
     */
    public function getClosureReason(): ?string
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $dateString = $now->format('Y-m-d');
        $closures = $this->getClosures();

        return $closures[$dateString] ?? null;
    }
}
