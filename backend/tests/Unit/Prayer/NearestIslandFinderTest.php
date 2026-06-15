<?php

declare(strict_types=1);

namespace Tests\Unit\Prayer;

use App\Domains\PrayerTimes\Services\NearestIslandFinder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NearestIslandFinderTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_closer_island_for_coordinates(): void
    {
        DB::table('prayer_categories')->insert(['id' => 1]);

        DB::table('prayer_islands')->insert([
            [
                'id' => 1,
                'category_id' => 1,
                'atoll' => 'ކ',
                'name' => 'Near',
                'name_latin' => 'Near',
                'offset_minutes' => 0,
                'latitude' => 4.20,
                'longitude' => 73.50,
                'is_active' => true,
            ],
            [
                'id' => 2,
                'category_id' => 1,
                'atoll' => 'ކ',
                'name' => 'Far',
                'name_latin' => 'Far',
                'offset_minutes' => 0,
                'latitude' => 0.50,
                'longitude' => 73.00,
                'is_active' => true,
            ],
        ]);

        $found = (new NearestIslandFinder)->find(4.18, 73.51);

        $this->assertNotNull($found);
        $this->assertSame(1, $found->id);
    }

    public function test_returns_null_when_no_island_has_coordinates(): void
    {
        DB::table('prayer_categories')->insert(['id' => 1]);
        DB::table('prayer_islands')->insert([
            'id' => 3,
            'category_id' => 1,
            'atoll' => 'ކ',
            'name' => 'NoCoords',
            'name_latin' => 'NoCoords',
            'offset_minutes' => 0,
            'latitude' => null,
            'longitude' => null,
            'is_active' => true,
        ]);

        $this->assertNull((new NearestIslandFinder)->find(4.18, 73.51));
    }
}
