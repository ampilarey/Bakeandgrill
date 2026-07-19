<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class UpdateOrderItemsMetaTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff-items-meta@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->device = Device::create([
            'name' => 'POS',
            'identifier' => 'META-POS-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-meta', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 25.00,
            'sku' => 'META-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    public function test_save_changes_can_switch_dine_in_to_takeaway(): void
    {
        $create = $this->postJson('/api/orders', [
            'type' => 'dine_in',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        $orderId = (int) $create->json('order.id');

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'type' => 'takeaway',
            'restaurant_table_id' => null,
        ])
            ->assertOk()
            ->assertJsonPath('order.type', 'takeaway');

        $order = Order::findOrFail($orderId);
        $this->assertSame('takeaway', $order->type);
        $this->assertNull($order->restaurant_table_id);
    }

    public function test_save_changes_can_switch_to_delivery_with_address(): void
    {
        $create = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        $orderId = (int) $create->json('order.id');

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'type' => 'delivery',
            'delivery_address_line1' => '1 Test Street',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Aisha',
            'delivery_contact_phone' => '+9607901234',
        ])
            ->assertOk()
            ->assertJsonPath('order.type', 'delivery');

        $order = Order::findOrFail($orderId);
        $this->assertSame('delivery', $order->type);
        $this->assertSame('1 Test Street', $order->delivery_address_line1);
        $this->assertSame('Male', $order->delivery_island);
        $this->assertSame('Aisha', $order->delivery_contact_name);
    }
}
