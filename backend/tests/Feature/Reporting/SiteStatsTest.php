<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The dashboard "big numbers" and the privacy-friendly visit counter:
 * views/uniques arithmetic, bot filtering, no stored identifiers, and the
 * reports.view gate on the stats endpoint.
 */
class SiteStatsTest extends TestCase
{
    use RefreshDatabase;

    private const UA = 'Mozilla/5.0 (iPhone; like Mac OS X) Safari/604.1';

    private function beacon(string $surface = 'web', string $ua = self::UA): void
    {
        $this->postJson('/api/visits/beacon', ['surface' => $surface], ['User-Agent' => $ua])
            ->assertOk();
    }

    public function test_views_count_every_hit_but_uniques_count_a_visitor_once(): void
    {
        $this->beacon();
        $this->beacon();
        $this->beacon();

        $row = DB::table('site_visits_daily')->where('surface', 'web')->first();
        $this->assertSame(3, (int) $row->views);
        $this->assertSame(1, (int) $row->uniques, 'same ip+ua on one day is one visitor');
    }

    public function test_different_visitors_and_surfaces_count_separately(): void
    {
        $this->beacon('web', self::UA);
        $this->beacon('web', 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0');
        $this->beacon('order', self::UA);

        $web = DB::table('site_visits_daily')->where('surface', 'web')->first();
        $order = DB::table('site_visits_daily')->where('surface', 'order')->first();
        $this->assertSame(2, (int) $web->uniques);
        $this->assertSame(1, (int) $order->uniques);
    }

    public function test_bots_are_not_counted(): void
    {
        $this->beacon('web', 'Mozilla/5.0 (compatible; Googlebot/2.1)');
        $this->beacon('web', 'facebookexternalhit/1.1 crawler');
        $this->beacon('web', 'curl/8.0');

        $this->assertSame(0, DB::table('site_visits_daily')->count());
    }

    public function test_nothing_identifiable_is_stored(): void
    {
        $this->beacon();

        $row = (array) DB::table('site_visits_daily')->first();
        $this->assertSame(
            ['id', 'date', 'surface', 'views', 'uniques', 'created_at', 'updated_at'],
            array_keys($row),
            'the visits table must hold aggregates only — no IPs, hashes or user agents',
        );
    }

    public function test_unknown_surface_is_rejected(): void
    {
        $this->postJson('/api/visits/beacon', ['surface' => 'pos'])->assertStatus(422);
    }

    public function test_stats_endpoint_requires_reports_view(): void
    {
        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);
        $this->getJson('/api/admin/site-stats')->assertStatus(403);
    }

    public function test_stats_totals_are_correct(): void
    {
        // 2 paid orders (one last month), 1 unpaid, 1 cancelled.
        $this->makePaidOrder(null, ['total_laar' => 10000]);                       // MVR 100 this month
        $old = $this->makePaidOrder(null, ['total_laar' => 5000]);                 // MVR 50 last month
        $old->forceFill(['created_at' => now()->subMonths(2), 'paid_at' => now()->subMonths(2)])->save();
        $this->makeOrder(null, ['status' => 'payment_pending']);
        $this->makeOrder(null, ['status' => 'cancelled']);
        Customer::factory()->create(['created_at' => now()->subMonths(3)]);

        $this->beacon();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson('/api/admin/site-stats')->assertOk();

        $this->assertSame(3, $res->json('orders.total'), 'cancelled orders never count');
        $this->assertSame(2, $res->json('orders.this_month'));
        // makeOrder created 4 customers via factory + 1 explicit old one.
        $this->assertGreaterThanOrEqual(5, $res->json('customers.total'));
        $this->assertSame(150.0, (float) $res->json('revenue.lifetime'));
        $this->assertSame(100.0, (float) $res->json('revenue.this_month'));
        $this->assertSame(1, $res->json('visits.today.views'));
        $this->assertSame(1, $res->json('visits.last_30.uniques'));
    }
}
