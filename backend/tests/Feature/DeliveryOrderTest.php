<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryOrderTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Burger', 'slug' => 'burger',
            'category_id' => $category->id,
            'price' => 50.00,
            'base_price' => 50.00,
            'cost' => 10.00,
            'is_active' => true, 'is_available' => true,
            'track_stock' => false,
        ]);

        $this->customer = Customer::create([
            'name' => 'Delivery Customer',
            'phone' => '+9607890000',
        ]);
    }

    private function validDeliveryPayload(array $overrides = []): array
    {
        return array_merge([
            'items' => [
                ['item_id' => $this->item->id, 'quantity' => 2],
            ],
            'delivery_address_line1' => '123 Main Street',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Ali Ahmed',
            'delivery_contact_phone' => '+9601234567',
        ], $overrides);
    }

    private function customerAuthHeaders(): array
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        return ['Authorization' => "Bearer {$token}"];
    }

    public function test_creates_delivery_order_with_delivery_fee(): void
    {
        $response = $this->postJson(
            '/api/orders/delivery',
            $this->validDeliveryPayload(),
            $this->customerAuthHeaders(),
        );

        $response->assertStatus(201)
            ->assertJsonPath('order.type', 'delivery')
            ->assertJsonPath('order.delivery_island', 'Male')
            ->assertJsonPath('order.delivery_contact_name', 'Ali Ahmed');

        $this->assertGreaterThan(0, $response->json('order.delivery_fee'));

        $order = Order::find($response->json('order.id'));
        $this->assertGreaterThan($this->item->price * 2, $order->total);
    }

    public function test_missing_address_returns_422(): void
    {
        $payload = $this->validDeliveryPayload();
        unset($payload['delivery_address_line1']);

        $response = $this->postJson('/api/orders/delivery', $payload, $this->customerAuthHeaders());

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['delivery_address_line1']);
    }

    public function test_missing_island_returns_422(): void
    {
        $payload = $this->validDeliveryPayload();
        unset($payload['delivery_island']);

        $response = $this->postJson('/api/orders/delivery', $payload, $this->customerAuthHeaders());

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['delivery_island']);
    }

    public function test_missing_contact_name_returns_422(): void
    {
        $payload = $this->validDeliveryPayload();
        unset($payload['delivery_contact_name']);

        $response = $this->postJson('/api/orders/delivery', $payload, $this->customerAuthHeaders());

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['delivery_contact_name']);
    }

    public function test_unauthenticated_returns_401(): void
    {
        $response = $this->postJson('/api/orders/delivery', $this->validDeliveryPayload());
        $response->assertStatus(401);
    }

    public function test_can_update_delivery_fields_on_pending_order(): void
    {
        $headers = $this->customerAuthHeaders();

        $createResponse = $this->postJson('/api/orders/delivery', $this->validDeliveryPayload(), $headers);
        $createResponse->assertStatus(201);
        $orderId = $createResponse->json('order.id');

        $updateResponse = $this->patchJson("/api/orders/{$orderId}/delivery", [
            'delivery_island' => 'Hulhumale',
            'delivery_notes' => 'Ring bell twice',
        ], $headers);

        $updateResponse->assertStatus(200)
            ->assertJsonPath('order.delivery_island', 'Hulhumale')
            ->assertJsonPath('order.delivery_notes', 'Ring bell twice');

        $order = Order::find($orderId);
        $this->assertGreaterThanOrEqual(30.0, $order->delivery_fee);
    }

    public function test_cannot_update_delivery_on_paid_order(): void
    {
        $order = Order::create([
            'order_number' => 'DEL-999',
            'type' => 'delivery',
            'status' => 'paid',
            'customer_id' => $this->customer->id,
            'subtotal' => 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100,
            'delivery_address_line1' => '1 Test St',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Test',
            'delivery_contact_phone' => '+9601234567',
            'delivery_fee' => 20,
        ]);

        $response = $this->patchJson(
            "/api/orders/{$order->id}/delivery",
            ['delivery_notes' => 'Too late'],
            $this->customerAuthHeaders(),
        );

        $response->assertStatus(422);
    }

    public function test_delivery_order_appears_in_kds_with_delivery_type(): void
    {
        $role = Role::create(['name' => 'KDS', 'slug' => 'kds', 'description' => '', 'is_active' => true]);
        $staff = User::create([
            'name' => 'KDS Staff', 'email' => 'kds@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('9999'), 'is_active' => true,
        ]);

        // Create delivery order as customer
        $createResponse = $this->postJson(
            '/api/orders/delivery',
            $this->validDeliveryPayload(),
            $this->customerAuthHeaders(),
        );
        $createResponse->assertStatus(201);

        // Check KDS as staff
        Sanctum::actingAs($staff, ['staff']);
        $kdsResponse = $this->getJson('/api/kds/orders');
        $kdsResponse->assertStatus(200);

        $orders = collect($kdsResponse->json('orders'));
        $deliveryOrder = $orders->firstWhere('id', $createResponse->json('order.id'));

        $this->assertNotNull($deliveryOrder, 'Delivery order should appear in KDS');
        $this->assertEquals('delivery', $deliveryOrder['type']);
    }
}
