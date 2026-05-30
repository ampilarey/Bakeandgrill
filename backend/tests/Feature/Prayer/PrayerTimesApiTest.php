<?php

declare(strict_types=1);

namespace Tests\Feature\Prayer;

use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PrayerTimesApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedMinimalPrayerData();
    }

    public function test_prayer_times_api_returns_male_island_times(): void
    {
        $response = $this->getJson('/api/prayer-times?island_id=102&date=2026-06-15');

        $response->assertOk()
            ->assertJsonPath('island.id', 102)
            ->assertJsonPath('island.name', PrayerTimeHelper::MALE_ISLAND_DV_NAME)
            ->assertJsonStructure([
                'date',
                'prayers' => ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'],
            ]);
    }

    public function test_prayer_times_api_defaults_date_to_mvt_today(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-22 20:00:00', 'UTC'));

        $response = $this->getJson('/api/prayer-times?island_id=102');

        $response->assertOk()
            ->assertJsonPath('date', '2026-05-23');

        Carbon::setTestNow();
    }

    public function test_prayer_times_api_rejects_unknown_island(): void
    {
        $this->getJson('/api/prayer-times?island_id=99999&date=2026-06-15')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['island_id']);
    }

    public function test_prayer_times_api_returns_404_for_inactive_island(): void
    {
        DB::table('prayer_islands')->insert([
            'id' => 200,
            'category_id' => 1,
            'atoll' => 'ކ',
            'atoll_latin' => 'Kaafu',
            'name' => 'Inactive',
            'name_latin' => 'Inactive',
            'offset_minutes' => 0,
            'latitude' => 4.0,
            'longitude' => 73.0,
            'is_active' => false,
        ]);

        $this->getJson('/api/prayer-times?island_id=200&date=2026-06-15')
            ->assertNotFound();
    }

    private function seedMinimalPrayerData(): void
    {
        DB::table('prayer_categories')->insert(['id' => 1]);

        DB::table('prayer_islands')->insert([
            'id' => 102,
            'category_id' => 1,
            'atoll' => 'ކ',
            'atoll_latin' => 'Kaafu',
            'name' => PrayerTimeHelper::MALE_ISLAND_DV_NAME,
            'name_latin' => 'Malé',
            'offset_minutes' => 1,
            'latitude' => 4.1754,
            'longitude' => 73.5093,
            'is_active' => true,
        ]);

        DB::table('prayer_times')->insert([
            [
                'category_id' => 1,
                'day_of_year' => 167,
                'fajr' => 270,
                'sunrise' => 330,
                'dhuhr' => 720,
                'asr' => 930,
                'maghrib' => 1080,
                'isha' => 1170,
            ],
            [
                'category_id' => 1,
                'day_of_year' => 144,
                'fajr' => 265,
                'sunrise' => 325,
                'dhuhr' => 715,
                'asr' => 925,
                'maghrib' => 1075,
                'isha' => 1165,
            ],
        ]);
    }
}
