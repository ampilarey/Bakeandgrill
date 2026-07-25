<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\OrderPromotion;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class FreeDeliveryPromoTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog(50.0);
        SiteSetting::set('delivery_free_threshold', '9999'); // force paid delivery without promo
        SiteSetting::set('delivery_default_fee', '30');
        SiteSetting::set('delivery_zone_fees', json_encode(['Male' => 20]));
    }

    public function test_waives_delivery_fee_on_delivery_orders(): void
    {
        $promo = $this->makePromo([
            'type' => 'free_delivery',
            'discount_value' => 0,
            'code' => 'FREEDEL',
            'waive_delivery' => true,
            'min_order_laar' => 5000,
        ]);

        $order = $this->buildPromoOrder(80.0, 1, null, 'delivery');
        $order->update([
            'delivery_island' => 'Male',
            'delivery_fee_laar' => 2000,
            'delivery_fee' => 20,
        ]);

        $result = app(PromotionEvaluator::class)->evaluate('FREEDEL', $order->fresh(['items.item']), $this->customer->id);
        $this->assertTrue($result['valid']);
        $this->assertSame(0, $result['discount_laar']);

        OrderPromotion::create([
            'order_id' => $order->id,
            'promotion_id' => $promo->id,
            'discount_laar' => 0,
            'status' => 'draft',
            'idempotency_key' => 'order-promo:' . $order->id . ':' . $promo->id,
        ]);

        $fresh = app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh(['items.item']));
        $this->assertSame(0, (int) $fresh->delivery_fee_laar);
    }

    public function test_ignored_for_pickup_orders(): void
    {
        $promo = $this->makePromo([
            'type' => 'free_delivery',
            'discount_value' => 0,
            'code' => 'FREEDEL2',
            'waive_delivery' => true,
        ]);

        $order = $this->buildPromoOrder(80.0, 1, null, 'takeaway');
        $order->update(['delivery_fee_laar' => 0]);

        OrderPromotion::create([
            'order_id' => $order->id,
            'promotion_id' => $promo->id,
            'discount_laar' => 0,
            'status' => 'draft',
            'idempotency_key' => 'order-promo:' . $order->id . ':' . $promo->id,
        ]);

        $fresh = app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh(['items.item']));
        $this->assertSame(0, (int) $fresh->delivery_fee_laar);
        $this->assertSame('takeaway', $fresh->type);
    }

    public function test_respects_min_order(): void
    {
        $this->makePromo([
            'type' => 'free_delivery',
            'discount_value' => 0,
            'code' => 'FREEDELMIN',
            'waive_delivery' => true,
            'min_order_laar' => 20000,
        ]);

        $order = $this->buildPromoOrder(50.0, 1, null, 'delivery');
        $result = app(PromotionEvaluator::class)->evaluate('FREEDELMIN', $order, $this->customer->id);

        $this->assertFalse($result['valid']);
        $this->assertStringContainsString('Minimum order', $result['message']);
    }
}
