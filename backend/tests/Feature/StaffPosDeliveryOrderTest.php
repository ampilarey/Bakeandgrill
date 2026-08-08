<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\Shift;
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

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Counter Burger',
            'category_id' => $category->id,
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
        PermissionCatalogSync::sync();

        $this->staff = User::create([
            'name' => 'POS Staff',
            'email' => 'pos-staff@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS Counter',
            'identifier' => 'POS-DELIVERY-ACTIVE',
            'type' => 'pos',
            'is_active' => true,
            'status' => 'approved',
        ]);
    }

    private function deliveryPayload(array $overrides = []): array
    {
        return array_merge([
            'items' => [
                ['item_id' => $this->item->id, 'quantity' => 1],
            ],
            'delivery_address_line1' => '123 Main Street',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Ali Ahmed',
            'delivery_contact_phone' => '+9607820288',
            'print' => false,
            'ticket_name' => 'Ali · Delivery',
        ], $overrides);
    }

    private function openShiftFor(User $user): Shift
    {
        return Shift::create([
            'user_id' => $user->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);
    }

    public function test_staff_can_create_and_hold_pos_delivery_with_dine_in_only_item(): void
    {
        $shift = $this->openShiftFor($this->staff);
        Sanctum::actingAs($this->staff, ['staff']);

        $create = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders/delivery', $this->deliveryPayload());

        $create->assertStatus(201)
            ->assertJsonPath('order.type', 'delivery')
            ->assertJsonPath('order.shift_id', $shift->id);

        $orderId = (int) $create->json('order.id');

        $hold = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/hold", [
                'ticket_name' => 'Ali · Delivery',
            ]);

        $hold->assertStatus(200)
            ->assertJsonPath('order.status', 'held');
    }

    public function test_staff_delivery_without_open_shift_returns_422(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders/delivery', $this->deliveryPayload())
            ->assertStatus(422);
    }

    public function test_staff_delivery_from_disabled_device_returns_403(): void
    {
        $this->openShiftFor($this->staff);

        Device::create([
            'name' => 'Disabled POS',
            'identifier' => 'POS-DELIVERY-DISABLED',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', 'POS-DELIVERY-DISABLED')
            ->postJson('/api/orders/delivery', $this->deliveryPayload())
            ->assertForbidden()
            ->assertJsonPath('code', 'device_disabled');
    }

    public function test_staff_delivery_with_active_device_and_own_shift_stores_shift_id(): void
    {
        $shift = $this->openShiftFor($this->staff);
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders/delivery', $this->deliveryPayload());

        $response->assertCreated()
            ->assertJsonPath('order.shift_id', $shift->id);

        $order = Order::findOrFail((int) $response->json('order.id'));
        $this->assertSame($shift->id, (int) $order->shift_id);
        $this->assertSame($this->staff->id, (int) $order->user_id);
    }

    public function test_customer_delivery_still_succeeds_without_shift_or_device_header(): void
    {
        // Re-enable delivery channel for the customer online path.
        ItemChannelAvailability::query()
            ->where('item_id', $this->item->id)
            ->where('channel', 'delivery')
            ->update(['is_enabled' => true]);

        $customer = Customer::create([
            'name' => 'Online Customer',
            'phone' => '+9607891111',
            'is_active' => true,
        ]);
        $token = $customer->createToken('cust', ['customer'])->plainTextToken;

        $response = $this->postJson(
            '/api/orders/delivery',
            $this->deliveryPayload(),
            ['Authorization' => "Bearer {$token}"],
        );

        $response->assertCreated()
            ->assertJsonPath('order.type', 'delivery')
            ->assertJsonPath('order.shift_id', null);

        $order = Order::findOrFail((int) $response->json('order.id'));
        $this->assertNull($order->shift_id);
        $this->assertNull($order->user_id);
        $this->assertSame($customer->id, (int) $order->customer_id);
    }

    public function test_staff_cannot_use_another_staff_members_shift(): void
    {
        $otherRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $other = User::create([
            'name' => 'Other Cashier',
            'email' => 'other-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $otherRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);

        $otherShift = $this->openShiftFor($other);

        // Acting staff has no open shift of their own — another cashier's open
        // shift must not satisfy the requirement.
        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders/delivery', $this->deliveryPayload([
                'shift_id' => $otherShift->id,
            ]))
            ->assertStatus(422);

        $this->assertDatabaseMissing('orders', [
            'user_id' => $this->staff->id,
            'shift_id' => $otherShift->id,
        ]);
    }
}
