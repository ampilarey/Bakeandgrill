<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PackagingFeeTest extends TestCase
{
    use RefreshDatabase;

    public function test_packaging_fee_applied_to_online_delivery_order(): void
    {
        SiteSetting::updateOrCreate(['key' => 'packaging_fee_enabled'], ['value' => '1', 'type' => 'boolean', 'group' => 'Ordering', 'label' => 'x', 'is_public' => false]);
        SiteSetting::updateOrCreate(['key' => 'packaging_fee_type'], ['value' => 'fixed', 'type' => 'text', 'group' => 'Ordering', 'label' => 'x', 'is_public' => false]);
        SiteSetting::updateOrCreate(['key' => 'packaging_fee_value'], ['value' => '5', 'type' => 'text', 'group' => 'Ordering', 'label' => 'x', 'is_public' => false]);
        SiteSetting::updateOrCreate(['key' => 'packaging_fee_apply_delivery'], ['value' => '1', 'type' => 'boolean', 'group' => 'Ordering', 'label' => 'x', 'is_public' => false]);

        $item = Item::factory()->create(['base_price' => 100]);
        $order = Order::factory()->create([
            'type' => 'delivery',
            'status' => 'pending',
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'delivery_fee_laar' => 0,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
        ]);

        app(\App\Domains\Orders\Services\OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        $this->assertSame(500, (int) $order->packaging_fee_laar);
        $this->assertGreaterThan(10000, (int) $order->total_laar);
    }
}
