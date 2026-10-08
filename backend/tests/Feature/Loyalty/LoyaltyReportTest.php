<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Models\Customer;
use App\Models\LoyaltyAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Reports → Customers → Loyalty. The page asked /api/reports/loyalty, a 404;
 * the route is /api/admin/reports/loyalty. Its sums come back as whole
 * numbers, zero (not null) when there are no accounts yet, because the page
 * formats each one.
 */
class LoyaltyReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_with_no_accounts_is_all_zeros(): void
    {
        $res = $this->getJson('/api/admin/reports/loyalty', $this->staffHeaders($this->makeOwner()))->assertOk();

        $this->assertSame([
            'total_outstanding_points' => 0,
            'total_earned_lifetime' => 0,
            'total_accounts' => 0,
            'bronze_count' => 0,
            'silver_count' => 0,
            'gold_count' => 0,
            'platinum_count' => 0,
        ], $res->json('report'));
    }

    public function test_report_sums_points_and_counts_tiers(): void
    {
        $a = Customer::create(['name' => 'Aishath', 'phone' => '+9607771111']);
        $b = Customer::create(['name' => 'Hassan', 'phone' => '+9607772222']);
        LoyaltyAccount::create(['customer_id' => $a->id, 'points_balance' => 120, 'points_held' => 0, 'lifetime_points' => 300, 'tier' => 'bronze']);
        LoyaltyAccount::create(['customer_id' => $b->id, 'points_balance' => 80, 'points_held' => 0, 'lifetime_points' => 900, 'tier' => 'gold']);

        $report = $this->getJson('/api/admin/reports/loyalty', $this->staffHeaders($this->makeOwner()))->assertOk()->json('report');

        $this->assertSame(200, $report['total_outstanding_points']);
        $this->assertSame(1200, $report['total_earned_lifetime']);
        $this->assertSame(2, $report['total_accounts']);
        $this->assertSame(1, $report['bronze_count']);
        $this->assertSame(1, $report['gold_count']);
        $this->assertSame(0, $report['silver_count']);
    }
}
