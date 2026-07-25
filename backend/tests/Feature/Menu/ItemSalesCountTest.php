<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemSalesCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_items_include_sales_30d_count(): void
    {
        MenuGroup::firstOrCreate(
            ['id' => 1],
            ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]
        );
        $cat = Category::create(['name' => 'Grill', 'is_active' => true]);
        $item = Item::create([
            'name' => 'Hot Plate',
            'base_price' => 50,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $cat->id,
            'has_variants' => false,
            'menu_group_id' => 1,
        ]);
        foreach (['online_pickup', 'takeaway', 'dine_in', 'delivery'] as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => $ch],
                ['is_enabled' => true],
            );
        }

        $order = Order::factory()->create([
            'status' => 'completed',
            'created_at' => now()->subDays(3),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 2,
            'unit_price' => 50,
            'total_price' => 100,
        ]);

        $res = $this->getJson('/api/items?available_only=1&channel=online_pickup');
        $res->assertOk();
        $row = collect($res->json('data'))->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertArrayHasKey('sales_30d', $row);
        $this->assertSame(1, (int) $row['sales_30d']);
    }
}
