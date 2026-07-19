<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PackagingFeeTest extends TestCase
{
    use RefreshDatabase;

    public function test_packaging_fee_sums_per_item_qty_for_delivery(): void
    {
        $cake = Item::factory()->create(['base_price' => 100, 'packaging_fee' => 5]);
        $bajiya = Item::factory()->create(['base_price' => 20, 'packaging_fee' => 1.5]);

        $order = Order::factory()->create([
            'type' => 'delivery',
            'status' => 'pending',
            'subtotal' => 140,
            'subtotal_laar' => 14000,
            'delivery_fee_laar' => 0,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $cake->id,
            'item_name' => $cake->name,
            'quantity' => 2,
            'unit_price' => 100,
            'total_price' => 200,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $bajiya->id,
            'item_name' => $bajiya->name,
            'quantity' => 3,
            'unit_price' => 20,
            'total_price' => 60,
        ]);

        app(\App\Domains\Orders\Services\OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        // 2×5 + 3×1.5 = 14.50 MVR = 1450 laar
        $this->assertSame(1450, (int) $order->packaging_fee_laar);
        $this->assertGreaterThan(14000, (int) $order->total_laar);
    }

    public function test_dine_in_has_zero_packaging_fee(): void
    {
        $item = Item::factory()->create(['base_price' => 100, 'packaging_fee' => 5]);
        $order = Order::factory()->create([
            'type' => 'dine_in',
            'status' => 'pending',
            'subtotal' => 100,
            'subtotal_laar' => 10000,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 2,
            'unit_price' => 100,
            'total_price' => 200,
        ]);

        app(\App\Domains\Orders\Services\OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        $order->refresh();
        $this->assertSame(0, (int) $order->packaging_fee_laar);
    }

    public function test_takeaway_and_online_pickup_apply_packaging(): void
    {
        $calc = app(PackagingFeeCalculator::class);
        $item = Item::factory()->create(['packaging_fee' => 2]);
        $lines = [['item_id' => $item->id, 'quantity' => 1]];

        $this->assertSame(200, $calc->previewPackagingForOrderType('takeaway', $lines));
        $this->assertSame(200, $calc->previewPackagingForOrderType('online_pickup', $lines));
        $this->assertSame(0, $calc->previewPackagingForOrderType('dine_in', $lines));
    }

    public function test_float_qty_rounds_like_prepared_stock(): void
    {
        $calc = app(PackagingFeeCalculator::class);
        $item = Item::factory()->create(['packaging_fee' => 1]);

        $this->assertSame(100, $calc->previewPackagingForOrderType('takeaway', [
            ['item_id' => $item->id, 'quantity' => 1.4],
        ]));
        $this->assertSame(200, $calc->previewPackagingForOrderType('takeaway', [
            ['item_id' => $item->id, 'quantity' => 1.5],
        ]));
    }

    public function test_zero_fee_items_contribute_nothing(): void
    {
        $calc = app(PackagingFeeCalculator::class);
        $item = Item::factory()->create(['packaging_fee' => 0]);

        $this->assertSame(0, $calc->previewPackagingForOrderType('delivery', [
            ['item_id' => $item->id, 'quantity' => 5],
        ]));
    }

    public function test_locked_packaging_fee_is_not_recomputed(): void
    {
        $item = Item::factory()->create(['base_price' => 100, 'packaging_fee' => 5]);
        $order = Order::factory()->create([
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'packaging_fee_laar' => 999,
            'payment_status' => 'paid',
            'status' => 'paid',
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
        $this->assertSame(999, (int) $order->packaging_fee_laar);
    }
}
