<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Services\SpecialPricingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pricing audit, 2026-10-01, findings 6 and 7: a special whose hours cross
 * midnight never ran, and the offers feed said a special ended at midnight
 * (or at the start of its last day) whatever its end time was.
 */
class DailySpecialWindowTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $cat = Category::create(['name' => 'Grill', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Late grill', 'category_id' => $cat->id, 'base_price' => 100,
            'is_active' => true, 'is_available' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param array<string, mixed> $attrs */
    private function special(array $attrs): DailySpecial
    {
        return DailySpecial::create(array_merge([
            'item_id' => $this->item->id, 'discount_pct' => 20, 'is_active' => true,
        ], $attrs));
    }

    public function test_a_window_crossing_midnight_runs_both_sides_of_it(): void
    {
        // Friday 2 October to Saturday 3 October 2026, 22:00 to 02:00.
        $s = $this->special([
            'start_date' => '2026-10-02', 'end_date' => '2026-10-03',
            'start_time' => '22:00', 'end_time' => '02:00',
        ]);

        Carbon::setTestNow('2026-10-02 21:59:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive(), 'before it opens');
        Carbon::setTestNow('2026-10-02 23:30:00');
        $this->assertTrue($s->fresh()->isCurrentlyActive(), 'Friday night');
        Carbon::setTestNow('2026-10-03 01:30:00');
        $this->assertTrue($s->fresh()->isCurrentlyActive(), 'after midnight, still Friday night');
        Carbon::setTestNow('2026-10-03 12:00:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive(), 'midday is outside the window');
        Carbon::setTestNow('2026-10-04 01:30:00');
        $this->assertTrue($s->fresh()->isCurrentlyActive(), 'the last night runs past the end date');
        Carbon::setTestNow('2026-10-04 23:00:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive(), 'Sunday night is after the end date');
        Carbon::setTestNow('2026-10-02 01:30:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive(), 'Thursday night is before the start date');
    }

    public function test_after_midnight_counts_as_the_evening_before_for_the_weekday(): void
    {
        // Fridays only (5), 22:00 to 02:00.
        $s = $this->special([
            'start_date' => '2026-10-01', 'end_date' => '2026-10-31',
            'start_time' => '22:00', 'end_time' => '02:00', 'days_of_week' => [5],
        ]);

        Carbon::setTestNow('2026-10-03 01:00:00'); // Saturday 01:00, Friday's night
        $this->assertTrue($s->fresh()->isCurrentlyActive());
        Carbon::setTestNow('2026-10-03 23:00:00'); // Saturday night
        $this->assertFalse($s->fresh()->isCurrentlyActive());
    }

    public function test_a_daytime_window_is_unchanged(): void
    {
        $s = $this->special([
            'start_date' => '2026-10-01', 'end_date' => '2026-10-01',
            'start_time' => '11:00', 'end_time' => '15:00',
        ]);

        Carbon::setTestNow('2026-10-01 10:59:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive());
        Carbon::setTestNow('2026-10-01 15:00:00');
        $this->assertTrue($s->fresh()->isCurrentlyActive(), 'the end minute itself still counts');
        Carbon::setTestNow('2026-10-01 15:01:00');
        $this->assertFalse($s->fresh()->isCurrentlyActive());
    }

    public function test_ends_at_is_the_real_finishing_moment(): void
    {
        $day = $this->special(['start_date' => '2026-10-01', 'end_date' => '2026-10-05', 'start_time' => '11:00', 'end_time' => '15:00']);
        $night = $this->special(['start_date' => '2026-10-02', 'end_date' => '2026-10-05', 'start_time' => '22:00', 'end_time' => '02:00']);
        $allDay = $this->special(['start_date' => '2026-10-03', 'end_date' => '2026-10-05']);

        $this->assertSame('2026-10-05 15:00:00', $day->fresh()->endsAt()->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 02:00:00', $night->fresh()->endsAt()->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-05 23:59:59', $allDay->fresh()->endsAt()->format('Y-m-d H:i:s'));
    }

    public function test_the_offers_feed_carries_the_finishing_moment_not_the_bare_date(): void
    {
        Carbon::setTestNow('2026-10-05 12:00:00');
        $this->special(['start_date' => '2026-10-01', 'end_date' => '2026-10-05', 'start_time' => '11:00', 'end_time' => '15:00']);
        app(SpecialPricingService::class)->bustCache();
        app(OffersService::class)->bustCache();

        $offer = collect(app(OffersService::class)->activeOffers())->firstWhere('kind', 'special');
        $this->assertNotNull($offer);
        $this->assertSame(
            Carbon::parse('2026-10-05 15:00:00')->toIso8601String(),
            $offer['ends_at'],
        );
    }
}
