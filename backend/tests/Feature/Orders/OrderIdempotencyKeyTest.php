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

class OrderIdempotencyKeyTest extends TestCase
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
            'email' => 'staff-idem@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->device = Device::create([
            'name' => 'POS',
            'identifier' => 'IDEM-POS-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-idem', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Roll',
            'base_price' => 50.00,
            'sku' => 'IDEM-R001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    public function test_duplicate_idempotency_key_returns_same_order(): void
    {
        $key = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        $payload = [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'idempotency_key' => $key,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ];

        $first = $this->postJson('/api/orders', $payload)->assertCreated();
        $firstId = (int) $first->json('order.id');

        $second = $this->postJson('/api/orders', $payload)->assertOk();
        $this->assertSame($firstId, (int) $second->json('order.id'));
        $this->assertSame(1, Order::where('idempotency_key', $key)->count());
    }
}
