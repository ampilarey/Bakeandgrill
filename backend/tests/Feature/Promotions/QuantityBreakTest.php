<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\PromotionTarget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class QuantityBreakTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog(50.0);
    }

    public function test_applies_when_qty_meets_min_on_targeted_lines(): void
    {
        $promo = $this->makePromo([
            'type' => 'quantity_break',
            'discount_value' => 0,
            'code' => 'QTY3',
            'scope' => 'item',
            'metadata' => ['min_qty' => 3, 'kind' => 'percentage', 'value' => 10],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        $order = $this->buildPromoOrder(150.0, 3);
        $result = app(PromotionEvaluator::class)->evaluate('QTY3', $order->fresh(['items.item']), $this->customer->id);

        $this->assertTrue($result['valid']);
        $this->assertSame(1500, $result['discount_laar']); // 10% of 15000
    }

    public function test_skips_when_qty_below_min(): void
    {
        $promo = $this->makePromo([
            'type' => 'quantity_break',
            'discount_value' => 0,
            'code' => 'QTY3B',
            'scope' => 'item',
            'metadata' => ['min_qty' => 3, 'kind' => 'percentage', 'value' => 10],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        $order = $this->buildPromoOrder(100.0, 2);
        $result = app(PromotionEvaluator::class)->evaluate('QTY3B', $order->fresh(['items.item']), $this->customer->id);

        $this->assertFalse($result['valid']);
    }
}
