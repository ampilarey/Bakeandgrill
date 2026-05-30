<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemAffinityTest extends TestCase
{
    use RefreshDatabase;

    public function test_compute_pairs_builds_bidirectional_stats(): void
    {
        $a = $this->makeItem(false, 10, ['name' => 'Coffee']);
        $b = $this->makeItem(false, 10, ['name' => 'Croissant']);
        $c = $this->makeItem(false, 10, ['name' => 'Tea']);

        $order1 = Order::factory()->create(['status' => 'paid']);
        OrderItem::create(['order_id' => $order1->id, 'item_id' => $a->id, 'item_name' => $a->name, 'quantity' => 1, 'unit_price' => 30, 'total_price' => 30]);
        OrderItem::create(['order_id' => $order1->id, 'item_id' => $b->id, 'item_name' => $b->name, 'quantity' => 1, 'unit_price' => 20, 'total_price' => 20]);

        $order2 = Order::factory()->create(['status' => 'completed']);
        OrderItem::create(['order_id' => $order2->id, 'item_id' => $a->id, 'item_name' => $a->name, 'quantity' => 1, 'unit_price' => 30, 'total_price' => 30]);
        OrderItem::create(['order_id' => $order2->id, 'item_id' => $b->id, 'item_name' => $b->name, 'quantity' => 1, 'unit_price' => 20, 'total_price' => 20]);
        OrderItem::create(['order_id' => $order2->id, 'item_id' => $c->id, 'item_name' => $c->name, 'quantity' => 1, 'unit_price' => 15, 'total_price' => 15]);

        $this->artisan('insights:compute-item-pairs', ['--days' => 90])
            ->assertSuccessful();

        $this->assertDatabaseHas('item_pair_stats', [
            'item_id' => $a->id,
            'paired_item_id' => $b->id,
            'pair_count' => 2,
        ]);

        $response = $this->postJson('/api/recommendations/cart', [
            'item_ids' => [$a->id],
            'limit' => 2,
        ])->assertOk();

        $ids = collect($response->json('items'))->pluck('id')->all();
        $this->assertSame([$b->id, $c->id], $ids);
    }
}
