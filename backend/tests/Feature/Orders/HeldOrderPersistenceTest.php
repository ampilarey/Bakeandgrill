<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HeldOrderPersistenceTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->staff = User::create([
            'name' => 'Held Staff',
            'email' => 'held-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'Held POS A',
            'identifier' => 'HELD-POS-A',
            'type' => 'pos',
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'Held POS B',
            'identifier' => 'HELD-POS-B',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Held Food', 'slug' => 'held-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Held Item',
            'base_price' => 25.0,
            'sku' => 'HLD-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_held_order_survives_new_staff_session_and_device_switch(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->withHeader('X-Device-Identifier', 'HELD-POS-A')
            ->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertCreated();

        $orderId = $this->withHeader('X-Device-Identifier', 'HELD-POS-A')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson("/api/orders/{$orderId}/hold", ['ticket_name' => 'Table 4'])
            ->assertOk();

        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', 'HELD-POS-B')
            ->getJson('/api/orders?held_only=1')
            ->assertOk()
            ->assertJsonFragment(['id' => $orderId]);

        $this->withHeader('X-Device-Identifier', 'HELD-POS-B')
            ->getJson("/api/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('order.status', 'held')
            ->assertJsonPath('order.ticket_name', 'Table 4');
    }

    public function test_held_order_can_be_resumed_after_simulated_logout(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->withHeader('X-Device-Identifier', 'HELD-POS-A')
            ->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertCreated();

        $orderId = $this->withHeader('X-Device-Identifier', 'HELD-POS-A')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson("/api/orders/{$orderId}/hold")->assertOk();
        $this->assertSame('held', Order::findOrFail($orderId)->status);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', 'HELD-POS-B')
            ->postJson("/api/orders/{$orderId}/resume")
            ->assertOk();

        $this->assertSame('pending', Order::findOrFail($orderId)->status);
    }
}
