<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PromotionTarget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Promotions\Concerns\BuildsPromoOrders;
use Tests\TestCase;

class BuyXGetYTest extends TestCase
{
    use BuildsPromoOrders;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedCatalog(30.0);
    }

    public function test_buy_2_get_1_free_discounts_cheapest_unit(): void
    {
        $cheap = Item::create([
            'category_id' => $this->category->id,
            'name' => 'Cheap',
            'base_price' => 10.0,
            'cost' => 2.0,
            'sku' => 'CHEAP-' . uniqid(),
            'barcode' => 'CHEAP-' . uniqid(),
            'is_active' => true,
            'is_available' => true,
        ]);
        $mid = Item::create([
            'category_id' => $this->category->id,
            'name' => 'Mid',
            'base_price' => 20.0,
            'cost' => 5.0,
            'sku' => 'MID-' . uniqid(),
            'barcode' => 'MID-' . uniqid(),
            'is_active' => true,
            'is_available' => true,
        ]);
        $pricey = Item::create([
            'category_id' => $this->category->id,
            'name' => 'Pricey',
            'base_price' => 30.0,
            'cost' => 8.0,
            'sku' => 'PRICY-' . uniqid(),
            'barcode' => 'PRICY-' . uniqid(),
            'is_active' => true,
            'is_available' => true,
        ]);

        $promo = $this->makePromo([
            'type' => 'buy_x_get_y',
            'discount_value' => 0,
            'code' => 'BOGO',
            'scope' => 'item',
            'metadata' => [
                'buy_qty' => 2,
                'get_qty' => 1,
                'get_discount_pct' => 100,
                'cheapest' => true,
            ],
        ]);
        foreach ([$cheap, $mid, $pricey] as $target) {
            PromotionTarget::create([
                'promotion_id' => $promo->id,
                'target_type' => 'item',
                'target_id' => $target->id,
                'is_exclusion' => false,
            ]);
        }

        $order = Order::create([
            'order_number' => 'BOGO1',
            'type' => 'takeaway',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 60.0,
            'subtotal_laar' => 6000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 60.0,
        ]);
        foreach ([[$cheap, 10.0], [$mid, 20.0], [$pricey, 30.0]] as [$it, $price]) {
            OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $it->id,
                'item_name' => $it->name,
                'quantity' => 1,
                'unit_price' => $price,
                'total_price' => $price,
            ]);
        }

        $result = app(PromotionEvaluator::class)->evaluate('BOGO', $order->fresh(['items.item']), $this->customer->id);

        $this->assertTrue($result['valid']);
        $this->assertSame(1000, $result['discount_laar']); // cheapest unit free
    }

    public function test_multiple_sets_and_never_exceeds_line_totals(): void
    {
        $promo = $this->makePromo([
            'type' => 'buy_x_get_y',
            'discount_value' => 0,
            'code' => 'BOGO6',
            'scope' => 'item',
            'metadata' => [
                'buy_qty' => 2,
                'get_qty' => 1,
                'get_discount_pct' => 100,
                'cheapest' => true,
            ],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        // 6 identical units @ 30 → 2 free units
        $order = $this->buildPromoOrder(180.0, 6);
        $result = app(PromotionEvaluator::class)->evaluate('BOGO6', $order->fresh(['items.item']), $this->customer->id);

        $this->assertTrue($result['valid']);
        $this->assertSame(6000, $result['discount_laar']);
        $this->assertLessThanOrEqual(18000, $result['discount_laar']);
    }
}
