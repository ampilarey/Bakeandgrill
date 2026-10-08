<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Models\Order;
use App\Models\Promotion;
use App\Models\PromotionRedemption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Reports → Customers → Promotions asked /api/reports/promotions, a 404; the
 * route is /api/admin/reports/promotions. Its counts and laari come back as
 * whole numbers so the tab's totals add up instead of joining strings.
 */
class PromotionReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_lists_each_promotion_with_whole_number_totals(): void
    {
        $promo = Promotion::create([
            'name' => 'Big spend', 'code' => 'BIG200',
            'type' => 'fixed', 'discount_value' => 20000,
            'is_active' => true, 'stackable' => false,
        ]);
        foreach ([['r1', 1500], ['r2', 2500]] as [$key, $laar]) {
            $order = Order::factory()->create(['status' => 'completed']);
            PromotionRedemption::create(['idempotency_key' => $key, 'promotion_id' => $promo->id, 'order_id' => $order->id, 'discount_laar' => $laar, 'status' => 'redeemed', 'redeemed_at' => now()]);
        }

        $row = collect(
            $this->getJson('/api/admin/reports/promotions', $this->staffHeaders($this->makeOwner()))->assertOk()->json('report'),
        )->firstWhere('code', 'BIG200');

        $this->assertSame(2, $row['redemptions_count']);
        $this->assertSame(4000, $row['total_discount_laar']);
    }
}
