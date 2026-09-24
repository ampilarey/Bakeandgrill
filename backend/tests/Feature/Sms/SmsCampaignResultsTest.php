<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Order;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * SMS audit follow-up, 2026-09-24: a campaign row says whether it worked —
 * recipients who bought within seven days, their orders and revenue.
 */
class SmsCampaignResultsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_results_count_paid_orders_by_reached_recipients_inside_the_window(): void
    {
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $c = [];
        for ($i = 1; $i <= 4; $i++) {
            $c[$i] = Customer::create(['name' => "C{$i}", 'phone' => sprintf('+96077%05d', $i), 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true]);
        }
        $started = Carbon::parse('2026-09-20 10:00:00');
        $campaign = SmsCampaign::create(['name' => 'Deal', 'message' => 'Deal', 'status' => 'completed', 'target_criteria' => [], 'started_at' => $started, 'total_recipients' => 3, 'sent_count' => 3]);
        foreach ([1 => 'sent', 2 => 'sent', 3 => 'failed'] as $i => $status) {
            SmsCampaignRecipient::create(['campaign_id' => $campaign->id, 'customer_id' => $c[$i]->id, 'phone' => $c[$i]->phone, 'status' => $status]);
        }

        $order = fn (int $i, string $at, float $total, string $status = 'completed') => Order::factory()->create([
            'customer_id' => $c[$i]->id, 'status' => $status, 'paid_at' => Carbon::parse($at), 'total' => $total, 'subtotal' => $total, 'tax_amount' => 0, 'total_laar' => (int) ($total * 100),
        ]);
        $order(1, '2026-09-21 12:00:00', 150);      // counts
        $order(1, '2026-09-25 12:00:00', 50);       // counts: same buyer, second order
        $order(2, '2026-09-19 12:00:00', 999);      // before the send
        $order(2, '2026-09-28 12:00:00', 999);      // after the window
        $order(2, '2026-09-22 12:00:00', 80, 'refunded'); // refunded: not a sale
        $order(3, '2026-09-22 12:00:00', 300);      // text failed: not reached
        $order(4, '2026-09-22 12:00:00', 300);      // not a recipient

        Carbon::setTestNow('2026-09-24 09:00:00');
        $results = $campaign->fresh()->results();
        $this->assertSame(['window_days' => 7, 'buyers' => 1, 'orders' => 2, 'revenue_mvr' => 200.0, 'buyer_rate' => 50.0, 'reached' => 2, 'complete' => false], $results);

        Carbon::setTestNow('2026-09-28 09:00:00');
        $this->assertTrue($campaign->fresh()->results()['complete']);

        $this->getJson('/api/admin/sms/campaigns')->assertOk()
            ->assertJsonPath('data.0.results.buyers', 1)
            ->assertJsonPath('data.0.results.revenue_mvr', 200);
        $draft = SmsCampaign::create(['name' => 'Draft', 'message' => 'x', 'status' => 'draft', 'target_criteria' => []]);
        $this->getJson("/api/admin/sms/campaigns/{$draft->id}")->assertOk()->assertJsonPath('campaign.results', null);
    }
}
