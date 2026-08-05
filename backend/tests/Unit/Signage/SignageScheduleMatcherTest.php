<?php

declare(strict_types=1);

namespace Tests\Unit\Signage;

use App\Domains\Signage\Services\SignageScheduleMatcher;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

final class SignageScheduleMatcherTest extends TestCase
{
    public function test_matches_when_no_schedule_constraints(): void
    {
        $now = Carbon::parse('2026-08-03 14:30:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([], $now));
    }

    public function test_rejects_outside_date_range(): void
    {
        $now = Carbon::parse('2026-08-03 12:00:00', 'Indian/Maldives');
        $this->assertFalse(SignageScheduleMatcher::matches([
            'date_start' => '2026-08-10',
            'date_end' => '2026-08-20',
        ], $now));
    }

    public function test_day_of_week_filter(): void
    {
        // 2026-08-03 is Monday (dayOfWeek=1)
        $now = Carbon::parse('2026-08-03 12:00:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches(['days' => [1]], $now));
        $this->assertFalse(SignageScheduleMatcher::matches(['days' => [0, 6]], $now));
    }

    public function test_same_day_window(): void
    {
        $now = Carbon::parse('2026-08-03 19:30:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([
            'windows' => [['start' => '18:00', 'end' => '22:00']],
        ], $now));
        $this->assertFalse(SignageScheduleMatcher::matches([
            'windows' => [['start' => '08:00', 'end' => '12:00']],
        ], $now));
    }

    public function test_overnight_window_matches_after_midnight(): void
    {
        $now = Carbon::parse('2026-08-04 01:30:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $now));
    }

    public function test_overnight_window_matches_before_midnight(): void
    {
        $now = Carbon::parse('2026-08-03 23:30:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $now));
    }

    public function test_overnight_window_rejects_midday(): void
    {
        $now = Carbon::parse('2026-08-03 14:00:00', 'Indian/Maldives');
        $this->assertFalse(SignageScheduleMatcher::matches([
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $now));
    }

    public function test_campaign_style_combined_schedule(): void
    {
        $now = Carbon::parse('2026-08-03 23:15:00', 'Indian/Maldives');
        $schedule = [
            'date_start' => '2026-08-01',
            'date_end' => '2026-08-31',
            'days' => [1, 2, 3, 4, 5],
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ];
        $this->assertTrue(SignageScheduleMatcher::matches($schedule, $now));
    }

    public function test_overnight_window_uses_start_day_after_midnight(): void
    {
        // 2026-08-07 is Friday (5); 2026-08-08 is Saturday (6).
        // Friday 22:00–02:00 must still match at Saturday 01:30 when days=[5].
        $saturdayMorning = Carbon::parse('2026-08-08 01:30:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([
            'days' => [5],
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $saturdayMorning));

        // Same instant must not match when only Saturday is listed.
        $this->assertFalse(SignageScheduleMatcher::matches([
            'days' => [6],
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $saturdayMorning));

        // Evening portion still keys off Friday.
        $fridayNight = Carbon::parse('2026-08-07 23:15:00', 'Indian/Maldives');
        $this->assertTrue(SignageScheduleMatcher::matches([
            'days' => [5],
            'windows' => [['start' => '22:00', 'end' => '02:00']],
        ], $fridayNight));
    }
}
