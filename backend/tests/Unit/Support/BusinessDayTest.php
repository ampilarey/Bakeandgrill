<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\BusinessDay;
use Tests\TestCase;

class BusinessDayTest extends TestCase
{
    public function test_bounds_for_maldives_day_when_app_timezone_is_utc(): void
    {
        config(['app.timezone' => 'UTC']);

        [$from, $to] = BusinessDay::bounds('2026-07-17');

        $this->assertSame('2026-07-16 19:00:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-07-17 18:59:59', $to->format('Y-m-d H:i:s'));
    }

    public function test_bounds_stay_on_wall_clock_when_app_timezone_is_maldives(): void
    {
        config(['app.timezone' => 'Indian/Maldives']);

        [$from, $to] = BusinessDay::bounds('2026-07-17');

        $this->assertSame('2026-07-17 00:00:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-07-17 23:59:59', $to->format('Y-m-d H:i:s'));
    }
}
