<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\OpeningHoursText;
use PHPUnit\Framework\TestCase;

class OpeningHoursTextTest extends TestCase
{
    public function test_times_read_the_way_people_say_them(): void
    {
        $this->assertSame('7:00 AM', OpeningHoursText::time('07:00'));
        $this->assertSame('12:00 AM', OpeningHoursText::time('00:00'));
        $this->assertSame('11:59 PM', OpeningHoursText::time('23:59:00'));
        $this->assertSame('late', OpeningHoursText::time('late'));
    }

    public function test_a_day_reads_as_a_range_or_null_when_closed(): void
    {
        $this->assertSame('2:00 PM – 1:00 AM', OpeningHoursText::range(['open' => '14:00', 'close' => '01:00']));
        $this->assertNull(OpeningHoursText::range(['closed' => true]));
        $this->assertNull(OpeningHoursText::range(['open' => '14:00']));
        $this->assertNull(OpeningHoursText::range(null));
    }

    public function test_days_with_the_same_hours_are_grouped_sunday_first(): void
    {
        $week = array_fill(0, 7, ['open' => '07:00', 'close' => '23:00']);
        $week[5] = ['open' => '07:00', 'close' => '02:00'];
        $week[6] = ['open' => '07:00', 'close' => '02:00'];

        $this->assertSame([
            ['days' => 'Sunday – Thursday', 'hours' => '7:00 AM – 11:00 PM'],
            ['days' => 'Friday – Saturday', 'hours' => '7:00 AM – 2:00 AM'],
        ], OpeningHoursText::groups($week));
    }

    public function test_a_missing_day_reads_closed(): void
    {
        $this->assertSame([
            ['days' => 'Sunday', 'hours' => '8:00 AM – 8:00 PM'],
            ['days' => 'Monday – Saturday', 'hours' => 'Closed'],
        ], OpeningHoursText::groups([0 => ['open' => '08:00', 'close' => '20:00']]));
    }
}
