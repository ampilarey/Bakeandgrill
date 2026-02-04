<?php

namespace App\Services;

use Carbon\Carbon;

class OpeningHoursService
{
    /**
     * Check if café is currently open
     */
    public function isOpenNow(): bool
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $today = $now->dayOfWeek; // 0 = Sunday, 6 = Saturday
        $currentTime = $now->format('H:i');
        
        // Check special closures
        $closures = config('opening_hours.closures', []);
        $dateString = $now->format('Y-m-d');
        if (isset($closures[$dateString])) {
            return false; // Closed for special reason
        }
        
        $hours = config("opening_hours.hours.{$today}");
        
        if (!$hours || ($hours['closed'] ?? false)) {
            return false;
        }
        
        $openTime = $hours['open'];
        $closeTime = $hours['close'];
        
        // Handle overnight hours (e.g., open 07:00, close 02:00 next day)
        if ($closeTime < $openTime) {
            // Open past midnight
            return $currentTime >= $openTime || $currentTime < $closeTime;
        }
        
        return $currentTime >= $openTime && $currentTime < $closeTime;
    }

    /**
     * Get today's opening hours
     */
    public function getTodayHours(): ?array
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $today = $now->dayOfWeek;
        
        return config("opening_hours.hours.{$today}");
    }

    /**
     * Get next opening time
     */
    public function getNextOpenTime(): ?Carbon
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        
        // Check next 7 days
        for ($i = 0; $i < 7; $i++) {
            $checkDate = $now->copy()->addDays($i);
            $dayOfWeek = $checkDate->dayOfWeek;
            $hours = config("opening_hours.hours.{$dayOfWeek}");
            
            if (!$hours || ($hours['closed'] ?? false)) {
                continue;
            }
            
            $openTime = Carbon::parse($checkDate->format('Y-m-d') . ' ' . $hours['open']);
            
            if ($openTime->isFuture()) {
                return $openTime;
            }
        }
        
        return null;
    }

    /**
     * Get closure reason for today (if any)
     */
    public function getClosureReason(): ?string
    {
        $now = Carbon::now(config('opening_hours.timezone'));
        $dateString = $now->format('Y-m-d');
        $closures = config('opening_hours.closures', []);
        
        return $closures[$dateString] ?? null;
    }
}
