<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Promotions\Listeners\ConsumePromoRedemptionsListener;
use App\Domains\Promotions\Listeners\ReleasePromoRedemptionOnRefundListener;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\OrderPromotion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class PromotionBudgetCapTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog();
    }

    public function test_rejects_when_budget_would_be_exceeded(): void
    {
        $promo = $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 2000,
            'code' => 'BUDGET',
            'budget_laar' => 3000,
        ]);
        DB::table('promotions')->where('id', $promo->id)->update(['spent_laar' => 2000]);

        $order = $this->buildPromoOrder(100.0);
        $result = app(PromotionEvaluator::class)->evaluate('BUDGET', $order, $this->customer->id);

        $this->assertFalse($result['valid']);
        $this->assertSame('This offer has reached its limit.', $result['message']);
    }

    public function test_spent_increments_on_pay_and_decrements_on_refund(): void
    {
        $promo = $this->makePromo([
            'type' => 'fixed',
            'discount_value' => 1500,
            'code' => 'BUDGET2',
            'budget_laar' => 10000,
        ]);

        $order = $this->buildPromoOrder(100.0);
        OrderPromotion::create([
            'order_id' => $order->id,
            'promotion_id' => $promo->id,
            'discount_laar' => 1500,
            'status' => 'draft',
            'idempotency_key' => 'order-promo:' . $order->id . ':' . $promo->id,
        ]);

        app(ConsumePromoRedemptionsListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order->fresh(), false)),
        );

        $this->assertSame(1500, (int) $promo->fresh()->spent_laar);
        $this->assertSame(1, (int) $promo->fresh()->redemptions_count);

        // pending → refunded is blocked by OrderObserver; write status directly.
        \Illuminate\Support\Facades\DB::table('orders')->where('id', $order->id)->update(['status' => 'refunded']);
        $order->refresh();
        app(ReleasePromoRedemptionOnRefundListener::class)->handle(
            new OrderRefunded(new OrderRefundedData(
                refundId: 1,
                orderId: $order->id,
                orderNumber: (string) $order->order_number,
                amount: (float) $order->total,
                reason: 'test',
                refundRatio: 1.0,
            )),
        );

        $this->assertSame(0, (int) $promo->fresh()->spent_laar);
        $this->assertSame(0, (int) $promo->fresh()->redemptions_count);
    }
}
