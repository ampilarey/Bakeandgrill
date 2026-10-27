<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\Refund;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The dashboard's Sales section (owner, 2026-10-27: "enhance the admin dash board
 * … more advanced graphics and features"): a period beside the one before it, a
 * point per hour, day, week or month, the weekday × hour grid, and the filters.
 */
class SalesTrendTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(CarbonImmutable::parse('2026-10-27 15:00:00'));
        $this->actingAs($this->makeOwner());
    }

    private function sale(string $at, float $total, array $extra = []): Order
    {
        return Order::factory()->create(array_merge([
            'status' => 'completed',
            'type' => 'dine_in',
            'total' => $total,
            'total_laar' => (int) round($total * 100),
            'tax_amount' => 0,
            'tax_laar' => 0,
            'discount_amount' => 0,
            'created_at' => $at,
        ], $extra));
    }

    public function test_a_week_by_day_with_the_week_before_and_the_grid(): void
    {
        $this->sale('2026-10-27 09:15:00', 100);
        $this->sale('2026-10-27 09:40:00', 50, ['discount_amount' => 5]);
        $this->sale('2026-10-25 20:05:00', 30, ['type' => 'takeaway']);
        $this->sale('2026-10-18 12:00:00', 40); // the week before
        $this->sale('2026-10-27 10:00:00', 999, ['status' => 'cancelled']); // never a sale
        $refunded = $this->sale('2026-10-26 13:00:00', 20);
        Refund::query()->forceCreate(['order_id' => $refunded->id, 'amount' => 20, 'status' => 'approved', 'created_at' => '2026-10-26 14:00:00']);

        $res = $this->getJson('/api/reports/sales-trend?from=2026-10-21&to=2026-10-27&group=day')->assertOk();

        $res->assertJsonPath('range.days', 7)
            ->assertJsonPath('previous.from', '2026-10-14')
            ->assertJsonPath('previous.to', '2026-10-20')
            ->assertJsonPath('totals.sales', 200)
            ->assertJsonPath('totals.orders', 4)
            ->assertJsonPath('totals.refunds', 20)
            ->assertJsonPath('totals.discounts', 5)
            ->assertJsonPath('totals.net', 180)
            ->assertJsonPath('totals.avg_order', 50)
            ->assertJsonPath('previous_totals.sales', 40);

        $series = collect($res->json('series'));
        $this->assertCount(7, $series, 'every day of the period, empty ones too');
        $this->assertSame(150.0, (float) $series->firstWhere('key', '2026-10-27')['sales']);
        $this->assertSame(0.0, (float) $series->firstWhere('key', '2026-10-22')['sales']);
        $this->assertCount(7, $res->json('previous_series'));

        // Tuesday (index 1) at 09:00 holds both morning sales.
        $this->assertSame(2, $res->json('heatmap.1.9.orders'));
        $this->assertSame(150.0, (float) $res->json('heatmap.1.9.sales'));

        $types = collect($res->json('by_type'))->keyBy('type');
        $this->assertSame(30.0, (float) $types['takeaway']['sales']);
    }

    public function test_hours_weeks_and_months(): void
    {
        $this->sale('2026-10-27 09:15:00', 100);
        $this->sale('2026-10-27 14:30:00', 25);

        $hours = $this->getJson('/api/reports/sales-trend?from=2026-10-27&to=2026-10-27&group=hour')->assertOk();
        $this->assertCount(24, $hours->json('series'));
        $this->assertSame(100.0, (float) collect($hours->json('series'))->firstWhere('key', '2026-10-27 09')['sales']);

        // A long period falls back from hours to days.
        $this->getJson('/api/reports/sales-trend?from=2026-09-01&to=2026-10-27&group=hour')->assertOk()->assertJsonPath('range.group', 'day');

        $months = $this->getJson('/api/reports/sales-trend?from=2026-08-01&to=2026-10-27&group=month')->assertOk();
        $this->assertSame(['2026-08', '2026-09', '2026-10'], array_column($months->json('series'), 'key'));
        $this->assertSame('2026-10-27', $months->json('series.2.to'), 'the last month stops at the end of the period');

        $weeks = $this->getJson('/api/reports/sales-trend?from=2026-10-14&to=2026-10-27&group=week')->assertOk();
        $this->assertSame('2026-10-14', $weeks->json('series.0.from'), 'a week begun before the period starts at the period');
    }

    public function test_filters_by_time_of_day_staff_and_order_type(): void
    {
        $cashier = $this->makeStaff('staff', ['name' => 'Aisha']);
        $this->sale('2026-10-27 08:30:00', 10, ['user_id' => $cashier->id]);
        $this->sale('2026-10-27 13:00:00', 20, ['type' => 'takeaway']);
        $this->sale('2026-10-27 23:30:00', 40);

        $this->getJson('/api/reports/sales-trend?from=2026-10-27&to=2026-10-27&hour_from=8&hour_to=14')
            ->assertOk()->assertJsonPath('totals.sales', 30);
        // A range past midnight.
        $this->getJson('/api/reports/sales-trend?from=2026-10-27&to=2026-10-27&hour_from=22&hour_to=9')
            ->assertOk()->assertJsonPath('totals.sales', 50);
        $this->getJson('/api/reports/sales-trend?from=2026-10-27&to=2026-10-27&user_id=' . $cashier->id)
            ->assertOk()->assertJsonPath('totals.sales', 10)
            ->assertJsonPath('staff.0.name', 'Aisha');
        $this->getJson('/api/reports/sales-trend?from=2026-10-27&to=2026-10-27&type=takeaway')
            ->assertOk()->assertJsonPath('totals.sales', 20);
    }

    public function test_it_needs_reports_view(): void
    {
        $this->actingAs($this->makeKitchenStaff());
        $this->getJson('/api/reports/sales-trend')->assertForbidden();
    }
}
