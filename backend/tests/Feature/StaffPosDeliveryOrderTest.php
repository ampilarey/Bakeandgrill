<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffPosDeliveryOrderTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Counter Burger',
            'slug' => 'counter-burger',
            'category_id' => $category->id,
            'price' => 50.00,
            'base_price' => 50.00,
            'cost' => 10.00,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
        ]);

        // Item boot seeds all channels — disable online delivery so this
        // mimics a counter-only item staff still need for phone delivery.
        ItemChannelAvailability::query()
            ->where('item_id', $this->item->id)
            ->where('channel', 'delivery')
            ->update(['is_enabled' => false]);

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'POS Staff',
            'email' => 'pos-staff@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_staff_can_create_and_hold_pos_delivery_with_dine_in_only_item(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $create = $this->postJson('/api/orders/delivery', [
            'items' => [
                ['item_id' => $this->item->id, 'quantity' => 1],
            ],
            'delivery_address_line1' => '123 Main Street',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Ali Ahmed',
            'delivery_contact_phone' => '+9607820288',
            'print' => false,
            'ticket_name' => 'Ali · Delivery',
        ]);

        $create->assertStatus(201)
            ->assertJsonPath('order.type', 'delivery');

        $orderId = (int) $create->json('order.id');

        $hold = $this->postJson("/api/orders/{$orderId}/hold", [
            'ticket_name' => 'Ali · Delivery',
        ]);

        $hold->assertStatus(200)
            ->assertJsonPath('order.status', 'held');
    }
}
