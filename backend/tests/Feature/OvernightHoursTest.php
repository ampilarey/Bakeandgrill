<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Services\CateringOrderingGateService;
use App\Services\DeliveryGateService;
use App\Services\OnlineOrderingGateService;
use App\Services\OpeningHoursService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Closing times after midnight.
 *
 * A café that shuts at 01:00 is ordinary here, and every gate got it wrong.
 *
 * The ordering, catering and delivery gates each kept their own copy of the
 * same window check, and each stamped both times onto today's date:
 *
 *     $open  = Carbon::createFromFormat('H:i', '17:00')->setDateFrom($now);
 *     $close = Carbon::createFromFormat('H:i', '01:00')->setDateFrom($now);
 *     if ($now->between($open, $close)) …
 *
 * Carbon's between() silently swaps reversed bounds, so a 17:00 → 01:00
 * window became 01:00 → 17:00 — **inverted**, not merely truncated. Measured
 * before the fix: open at 13:00, closed at 23:00. Exactly backwards, and
 * nothing in the admin would have shown it.
 *
 * OpeningHoursService had the milder version: it handled an overnight window
 * on today's row but never looked at yesterday's, so a Sunday 22:00 → 02:00
 * window reported the café shut at 01:00 on Monday.
 *
 * These tests pin the boundary from both sides. A test that only checks 23:00
 * would have passed against the inverted implementation for one of the two
 * gates it covers.
 */
class OvernightHoursTest extends TestCase
{
    use RefreshDatabase;

    /** 17:00 → 01:00, every day. */
    private function seedOvernightSchedule(string $key): void
    {
        $schedule = [];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $day) {
            $schedule[$day] = ['enabled' => true, 'windows' => [['open' => '17:00', 'close' => '01:00']]];
        }
        SiteSetting::set($key, json_encode($schedule));
        SiteSetting::bust();
    }

    private function at(string $time): Carbon
    {
        // A Monday, so "yesterday" is a real scheduled day rather than a gap.
        return Carbon::parse('2026-08-24 ' . $time, config('app.timezone', 'UTC'));
    }

    /** @return list<array{0: string, 1: bool}> */
    public static function overnightTimes(): array
    {
        return [
            'mid-afternoon, before opening' => ['13:00', false],
            'a minute before opening' => ['16:59', false],
            'the moment it opens' => ['17:00', true],
            'late evening' => ['23:00', true],
            'after midnight, still open' => ['00:30', true],
            'the moment it closes' => ['01:00', false],
            'after closing' => ['02:00', false],
        ];
    }

    #[DataProvider('overnightTimes')]
    public function test_online_ordering_honours_a_window_past_midnight(string $time, bool $expected): void
    {
        SiteSetting::set('online_ordering_enabled', '1');
        $this->seedOvernightSchedule('online_ordering_schedule');

        $this->assertSame(
            $expected,
            app(OnlineOrderingGateService::class)->isOpen($this->at($time)),
            "online ordering at {$time}",
        );
    }

    #[DataProvider('overnightTimes')]
    public function test_catering_honours_a_window_past_midnight(string $time, bool $expected): void
    {
        SiteSetting::set('catering_ordering_enabled', '1');
        $this->seedOvernightSchedule('catering_ordering_schedule');

        $this->assertSame(
            $expected,
            app(CateringOrderingGateService::class)->isOpen($this->at($time)),
            "catering at {$time}",
        );
    }

    #[DataProvider('overnightTimes')]
    public function test_delivery_honours_a_window_past_midnight(string $time, bool $expected): void
    {
        SiteSetting::set('delivery_accepting_orders', '1');
        $this->seedOvernightSchedule('delivery_schedule');

        $this->assertSame(
            $expected,
            // Capacity off: this test is about the clock, not the queue depth.
            app(DeliveryGateService::class)->isDeliveryOpen(null, $this->at($time), false),
            "delivery at {$time}",
        );
    }

    public function test_a_daytime_window_is_unaffected(): void
    {
        // The overnight fix must not disturb the ordinary case, which is what
        // every existing schedule actually uses.
        $schedule = [];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $day) {
            $schedule[$day] = ['enabled' => true, 'windows' => [['open' => '10:00', 'close' => '22:00']]];
        }
        SiteSetting::set('online_ordering_enabled', '1');
        SiteSetting::set('online_ordering_schedule', json_encode($schedule));
        SiteSetting::bust();

        $gate = app(OnlineOrderingGateService::class);

        $this->assertFalse($gate->isOpen($this->at('09:00')));
        $this->assertTrue($gate->isOpen($this->at('10:00')));
        $this->assertTrue($gate->isOpen($this->at('21:59')));
        $this->assertFalse($gate->isOpen($this->at('22:00')));
        $this->assertFalse($gate->isOpen($this->at('23:30')));
    }

    // ── Opening hours ─────────────────────────────────────────────────────

    /**
     * Sunday runs late; the rest of the week is an ordinary day shift. The
     * point is that Monday 01:00 belongs to *Sunday's* window, which the old
     * code could not express.
     */
    private function seedLateSunday(): void
    {
        $hours = [];
        for ($day = 0; $day < 7; $day++) {
            $hours[$day] = ['open' => '10:00', 'close' => '22:00'];
        }
        $hours[0] = ['open' => '22:00', 'close' => '02:00'];
        SiteSetting::set('business_hours_json', json_encode($hours));
        SiteSetting::bust();
    }

    /** @return list<array{0: string, 1: bool}> */
    public static function lateSundayTimes(): array
    {
        return [
            'Sunday lunchtime — closed, the day starts at 22:00' => ['2026-08-23 12:00', false],
            'Sunday night, inside the window' => ['2026-08-23 23:00', true],
            'Monday 01:00 — still Sunday night' => ['2026-08-24 01:00', true],
            'Monday 03:00 — Sunday has ended, Monday has not begun' => ['2026-08-24 03:00', false],
            'Monday daytime' => ['2026-08-24 11:00', true],
        ];
    }

    #[DataProvider('lateSundayTimes')]
    public function test_opening_hours_carry_yesterdays_window_past_midnight(string $moment, bool $expected): void
    {
        $this->seedLateSunday();
        Carbon::setTestNow(Carbon::parse($moment, config('opening_hours.timezone')));

        try {
            $this->assertSame($expected, app(OpeningHoursService::class)->isOpenNow(), $moment);
        } finally {
            Carbon::setTestNow();
        }
    }
}
