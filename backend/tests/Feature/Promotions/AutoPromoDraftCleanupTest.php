<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\OrderItem;
use App\Models\OrderPromotion;
use App\Models\PromotionTarget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class AutoPromoDraftCleanupTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog(50.0);
    }

    public function test_reapply_after_removing_qualifying_item_drops_stale_auto_draft(): void
    {
        $promo = $this->makePromo([
            'name' => 'Auto item 20%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 20,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        $order = $this->buildPromoOrder(100.0, 2);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(1, $applied);
        $this->assertSame(1, OrderPromotion::where('order_id', $order->id)->where('status', 'draft')->count());
        $this->assertGreaterThan(0, (int) $order->fresh()->promo_discount_laar);

        // Remove qualifying lines — promo no longer eligible.
        OrderItem::where('order_id', $order->id)->delete();
        $order->unsetRelation('items');
        $order->update(['subtotal' => 0, 'subtotal_laar' => 0]);

        $reapplied = app(PromotionEvaluator::class)->applyAutomatic(
            $order->fresh(['items.item']),
            $this->customer->id,
        );

        $this->assertCount(0, $reapplied);
        $this->assertSame(0, OrderPromotion::where('order_id', $order->id)->where('status', 'draft')->count());
        $this->assertSame(0, (int) $order->fresh()->promo_discount_laar);
    }
}
