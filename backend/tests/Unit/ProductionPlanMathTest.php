<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Kitchen\Support\PlanSlots;
use App\Domains\Kitchen\Support\WeightedStats;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * The arithmetic under the production plan, checked without a database.
 * (The app still boots: slot validation speaks through ValidationException
 * and windows read the app timezone.)
 */
class ProductionPlanMathTest extends TestCase
{
    public function test_linear_weights_favour_the_newest(): void
    {
        $this->assertSame([1.0, 2.0, 3.0], WeightedStats::linearWeights(3));
        $this->assertSame([], WeightedStats::linearWeights(0));
    }

    public function test_weighted_mean(): void
    {
        $this->assertEqualsWithDelta(2.5, WeightedStats::mean([1.0, 2.0, 3.0, 4.0]), 1e-9);
        // Newest counts most: (1×1 + 4×2) / 3 = 3.
        $this->assertEqualsWithDelta(3.0, WeightedStats::mean([1.0, 4.0], [1.0, 2.0]), 1e-9);
        $this->assertSame(0.0, WeightedStats::mean([]));
    }

    public function test_quantile_covers_the_share_of_days_asked_for(): void
    {
        $values = [40.0, 45.0, 50.0, 55.0, 60.0];
        $equal = [1.0, 1.0, 1.0, 1.0, 1.0];

        $this->assertEqualsWithDelta(50.0, WeightedStats::quantile($values, $equal, 0.5), 1e-9);
        // 85% sits between the 4th and 5th of five: 55 + 0.75 × 5.
        $this->assertEqualsWithDelta(58.75, WeightedStats::quantile($values, $equal, 0.85), 1e-9);
        $this->assertEqualsWithDelta(40.0, WeightedStats::quantile($values, $equal, 0.0), 1e-9);
        $this->assertEqualsWithDelta(60.0, WeightedStats::quantile($values, $equal, 1.0), 1e-9);
    }

    public function test_quantile_leans_towards_the_heavier_days(): void
    {
        // Recent days sold more; the median should sit above the plain one.
        $values = [40.0, 42.0, 60.0, 62.0];
        $plain = WeightedStats::quantile($values, [1.0, 1.0, 1.0, 1.0], 0.5);
        $recent = WeightedStats::quantile($values, [1.0, 2.0, 3.0, 4.0], 0.5);

        $this->assertGreaterThan($plain, $recent);
    }

    public function test_quantile_edge_cases(): void
    {
        $this->assertSame(0.0, WeightedStats::quantile([], [], 0.85));
        $this->assertSame(7.0, WeightedStats::quantile([7.0], [1.0], 0.85));
        // Zero weights fall back to a plain position.
        $this->assertSame(3.0, WeightedStats::quantile([1.0, 2.0, 3.0], [0.0, 0.0, 0.0], 1.0));
    }

    public function test_shrink_pulls_thin_evidence_towards_the_prior(): void
    {
        $this->assertSame(1.0, WeightedStats::shrink(0.5, 0, 1.0, 4));
        // Three days at half, four phantom days at 1: (1.5 + 4) / 7.
        $this->assertEqualsWithDelta(5.5 / 7, WeightedStats::shrink(0.5, 3, 1.0, 4), 1e-9);
        // Lots of evidence: barely moved.
        $this->assertEqualsWithDelta(0.5, WeightedStats::shrink(0.5, 400, 1.0, 4), 0.01);
    }

    public function test_ceil_to_batch(): void
    {
        $this->assertSame(50.0, WeightedStats::ceilTo(47.0, 10));
        $this->assertSame(50.0, WeightedStats::ceilTo(50.0, 10));
        $this->assertSame(50.0, WeightedStats::ceilTo(49.9999999, 10));
        $this->assertSame(47.0, WeightedStats::ceilTo(46.2, 1));
        $this->assertSame(0.0, WeightedStats::ceilTo(0.0, 10));
        $this->assertSame(0.0, WeightedStats::ceilTo(-3.0, 10));
    }

    public function test_default_slots_cover_the_day_and_wrap_midnight(): void
    {
        $slots = PlanSlots::fromSettings(['slots' => PlanSlots::DEFAULT_SLOTS]);

        $this->assertSame(6, $slots->dayStartHour());
        $this->assertSame('Evening', $slots->forHour(19)['label']);
        $this->assertSame('Night', $slots->forHour(23)['label']);
        $this->assertSame('Night', $slots->forHour(1)['label']);
        $this->assertSame('Morning', $slots->forHour(6)['label']);
        $this->assertSame('18', $slots->keyForHour(21));
    }

    public function test_small_hours_belong_to_the_day_that_opened(): void
    {
        $slots = PlanSlots::fromSettings(['slots' => PlanSlots::DEFAULT_SLOTS]);

        $this->assertSame('2026-09-11', $slots->businessDate(Carbon::parse('2026-09-12 01:30')));
        $this->assertSame('2026-09-12', $slots->businessDate(Carbon::parse('2026-09-12 06:00')));

        [$start, $end] = $slots->window('2026-09-11', ['from' => 22, 'to' => 6]);
        $this->assertSame('2026-09-11 22:00', $start->format('Y-m-d H:i'));
        $this->assertSame('2026-09-12 06:00', $end->format('Y-m-d H:i'));
    }

    public function test_slot_validation_wants_every_hour_accounted_for(): void
    {
        // Access the validator through the same path save() uses, without a DB.
        $method = new \ReflectionMethod(PlanSlots::class, 'cleanSlots');

        $ok = $method->invoke(null, [
            ['label' => 'Night', 'from' => 21, 'to' => 7],
            ['label' => 'Day', 'from' => 7, 'to' => 21],
        ]);
        // Sorted to start the trading day with the daytime slot.
        $this->assertSame('Day', $ok[0]['label']);
        $this->assertSame('Night', $ok[1]['label']);

        try {
            $method->invoke(null, [['label' => 'Day', 'from' => 7, 'to' => 21]]);
            $this->fail('A gap should be rejected');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('No slot covers 00:00', $e->getMessage());
        }

        try {
            $method->invoke(null, [
                ['label' => 'A', 'from' => 0, 'to' => 12],
                ['label' => 'B', 'from' => 11, 'to' => 0],
            ]);
            $this->fail('An overlap should be rejected');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('overlaps', $e->getMessage());
        }

        try {
            $method->invoke(null, [['label' => '', 'from' => 0, 'to' => 0]]);
            $this->fail('A nameless slot should be rejected');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('needs a name', $e->getMessage());
        }
    }
}
