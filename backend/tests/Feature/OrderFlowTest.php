<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_create_order_and_take_payment(): void
    {
        $role = Role::create([
            'name' => 'Cashier',
            'slug' => 'cashier',
            'description' => 'Cashier role',
            'is_active' => true,
        ]);

        $user = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $device = Device::create([
            'name' => 'POS-01',
            'identifier' => 'POS-001',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create([
            'name' => 'Food',
            'slug' => 'food',
            'is_active' => true,
        ]);

        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 20,
            'sku' => 'FOOD-001',
            'barcode' => 'FOOD-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        Sanctum::actingAs($user);

        $createResponse = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $device->identifier,
                'items' => [
                    [
                        'item_id' => $item->id,
                        'name' => $item->name,
                        'quantity' => 2,
                    ],
                ],
            ]);

        $createResponse->assertCreated()
            ->assertJsonStructure(['order' => ['id', 'total']]);

        $orderId = $createResponse->json('order.id');

        $paymentResponse = $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [
                [
                    'method' => 'cash',
                    'amount' => 40,
                ],
            ],
            'print_receipt' => false,
        ]);

        $paymentResponse->assertOk()
            ->assertJsonPath('order.id', $orderId);
    }
}
