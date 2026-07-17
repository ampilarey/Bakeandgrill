<?php

declare(strict_types=1);

namespace Tests\Unit\Kitchen;

use App\Domains\Kitchen\Services\WaitTimeEstimator;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WaitTimeEstimatorTest extends TestCase
{
    use RefreshDatabase;

    public function test_empty_queue_returns_minimum_wait(): void
    {
        $result = (new WaitTimeEstimator)->fromOrders(collect());

        $this->assertSame(5, $result['wait_minutes']);
        $this->assertSame(0, $result['queue_depth']);
    }

    public function test_uses_prep_time_and_parallelism(): void
    {
        $item = Item::factory()->create(['prep_time_minutes' => 20, 'is_available' => true]);
        $order = Order::factory()->create(['status' => 'pending']);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'tax_rate' => 0,
        ]);
        $order->load('items.item');

        $result = (new WaitTimeEstimator)->fromOrders(collect([$order]));

        // 20 prep / 2 parallel = 10
        $this->assertSame(10, $result['wait_minutes']);
        $this->assertSame(1, $result['queue_depth']);
    }
}
