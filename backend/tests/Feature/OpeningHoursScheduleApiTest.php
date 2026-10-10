<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * UI audit, 2026-10-10: the order app's Hours page read "Hours not
 * available" for every day. The schedule endpoint sent the built-in config
 * hours as a list numbered 0 to 6; the page looks days up by name. It now
 * sends the hours set in Admin, by day name, as the website shows them.
 */
class OpeningHoursScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_schedule_is_the_admin_hours_keyed_by_day_name(): void
    {
        $hours = [];
        for ($day = 0; $day < 7; $day++) {
            $hours[$day] = ['open' => '07:00', 'close' => '23:00'];
        }
        $hours[5] = ['open' => '14:00', 'close' => '01:00'];
        $hours[6] = ['closed' => true];
        SiteSetting::set('business_hours_json', json_encode($hours));
        SiteSetting::bust();

        $res = $this->getJson('/api/opening-hours')->assertOk();

        $res->assertJsonPath('schedule.sunday', ['closed' => false, 'open' => '07:00', 'close' => '23:00']);
        $res->assertJsonPath('schedule.friday', ['closed' => false, 'open' => '14:00', 'close' => '01:00']);
        $res->assertJsonPath('schedule.saturday', ['closed' => true, 'open' => null, 'close' => null]);
        $this->assertSame(
            ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
            array_keys($res->json('schedule')),
        );
    }

    public function test_a_day_missing_from_the_admin_hours_reads_closed(): void
    {
        SiteSetting::set('business_hours_json', json_encode([1 => ['open' => '08:00', 'close' => '20:00']]));
        SiteSetting::bust();

        $res = $this->getJson('/api/opening-hours')->assertOk();

        $res->assertJsonPath('schedule.monday.open', '08:00');
        $res->assertJsonPath('schedule.sunday.closed', true);
    }
}
