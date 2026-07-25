<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class FirstOrderOnlyTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog();
    }

    public function test_applies_on_first_order(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 1000,
            'code' => 'FIRST',
            'first_order_only' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $result = app(PromotionEvaluator::class)->evaluate('FIRST', $order, $this->customer->id);

        $this->assertTrue($result['valid']);
        $this->assertSame(1000, $result['discount_laar']);
    }

    public function test_rejects_when_customer_has_prior_completed_order(): void
    {
        $promo = $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 1000,
            'code' => 'FIRST2',
            'first_order_only' => true,
        ]);
        $this->assertTrue((bool) $promo->fresh()->first_order_only);

        $prior = $this->buildPromoOrder(50.0);
        // Bypass OrderObserver state machine (pending → completed is not allowed).
        \Illuminate\Support\Facades\DB::table('orders')->where('id', $prior->id)->update([
            'payment_status' => 'paid',
            'status' => 'completed',
        ]);

        $order = $this->buildPromoOrder(100.0);
        $result = app(PromotionEvaluator::class)->evaluate('FIRST2', $order, $this->customer->id);

        $this->assertFalse($result['valid'], $result['message'] ?? 'expected reject');
        $this->assertSame('This offer is only available on your first order.', $result['message']);
    }

    public function test_guest_counts_as_first_order(): void
    {
        $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 500,
            'code' => 'GUEST1',
            'first_order_only' => true,
        ]);

        $order = $this->buildPromoOrder(100.0);
        $order->update(['customer_id' => null]);

        $result = app(PromotionEvaluator::class)->evaluate('GUEST1', $order->fresh(['items.item']), null);

        $this->assertTrue($result['valid']);
    }
}
