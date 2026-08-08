<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryIdempotencyOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-idem', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Delivery Burger',
            'category_id' => $category->id,
            'base_price' => 40,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
        ]);
        ItemChannelAvailability::query()
            ->where('item_id', $this->item->id)
            ->where('channel', 'delivery')
            ->update(['is_enabled' => true]);
    }

    public function test_customer_cannot_reuse_another_customers_idempotency_key(): void
    {
        $a = Customer::create(['name' => 'A', 'phone' => '+9607001001', 'is_active' => true]);
        $b = Customer::create(['name' => 'B', 'phone' => '+9607001002', 'is_active' => true]);

        Order::create([
            'order_number' => 'DEL-IDEM-A',
            'type' => 'delivery',
            'status' => 'pending',
            'customer_id' => $a->id,
            'subtotal' => 40,
            'total' => 40,
            'idempotency_key' => 'shared-key-xyz',
            'delivery_address_line1' => 'Secret Address',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'A',
            'delivery_contact_phone' => '+9607001001',
        ]);

        Sanctum::actingAs($b, ['customer']);

        $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'delivery_address_line1' => 'Other Place',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'B',
            'delivery_contact_phone' => '+9607001002',
            'idempotency_key' => 'shared-key-xyz',
            'print' => false,
        ])->assertStatus(409);
    }
}
