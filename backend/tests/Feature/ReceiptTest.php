<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceiptTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_send_receipt(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => 'Staff role', 'is_active' => true],
        );

        $user = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Jane Doe',
            'phone' => '+9607001234',
            'email' => 'jane@example.com',
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'BG-TEST-0001',
            'type' => 'takeaway',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'user_id' => $user->id,
            'subtotal' => 10,
            'total' => 10,
        ]);

        Sanctum::actingAs($user, ['staff']);

        $response = $this->postJson("/api/receipts/{$order->id}/send", [
            'channel' => 'email',
            'recipient' => 'jane@example.com',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['receipt' => ['id', 'token'], 'link']);
    }

    public function test_staff_can_get_receipt_link_without_sending(): void
    {
        $role = Role::create([
            'name' => 'Cashier2',
            'slug' => 'cashier2',
            'description' => 'Cashier role',
            'is_active' => true,
        ]);

        $user = User::create([
            'name' => 'Cashier2',
            'email' => 'cashier2@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'John',
            'phone' => '+9607001999',
            'email' => null,
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'BG-TEST-LINK',
            'type' => 'dine_in',
            'status' => 'pending',
            'customer_id' => $customer->id,
            'user_id' => $user->id,
            'subtotal' => 25,
            'total' => 25,
        ]);

        Sanctum::actingAs($user, ['staff']);

        $response = $this->getJson("/api/orders/{$order->id}/receipt-link");

        $response->assertOk()
            ->assertJsonStructure(['link']);

        $this->assertStringContainsString('/receipts/', $response->json('link'));
    }
}
