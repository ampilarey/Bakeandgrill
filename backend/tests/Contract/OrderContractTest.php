<?php

declare(strict_types=1);

namespace Tests\Contract;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

/**
 * Contract tests for the Order API.
 * These are snapshot-based: on first run they write the expected shape,
 * on subsequent runs they assert it has not changed.
 */
class OrderContractTest extends ContractTestCase
{
    private User $staff;
    private Device $device;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create([
            'name' => 'Cashier',
            'slug' => 'cashier',
            'description' => 'Cashier role',
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Test Cashier',
            'email' => 'cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS-01',
            'identifier' => 'TEST-001',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create([
            'name' => 'Burgers',
            'slug' => 'burgers',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Classic Burger',
            'base_price' => 22.00,
            'sku' => 'BRG-001',
            'barcode' => 'BRG-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_create_order_response_shape(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'notes' => null,
            'discount_amount' => 0,
            'print' => false,
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'quantity' => 1,
                ],
            ],
        ]);

        $response->assertCreated();
        $this->assertMatchesApiSnapshot($response, 'order.create');
    }

    public function test_order_show_response_shape(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $createResponse = $this->postJson('/api/orders', [
            'type' => 'dine_in',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
        ]);

        $orderId = $createResponse->json('order.id');
        $response = $this->getJson("/api/orders/{$orderId}");
        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'order.show');
    }

    public function test_add_payments_completes_order_response_shape(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $createResponse = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $orderId = $createResponse->json('order.id');
        $total = $createResponse->json('order.total');

        $response = $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [
                ['method' => 'cash', 'amount' => $total],
            ],
            'print_receipt' => false,
        ]);

        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'order.add_payments');
    }

    public function test_hold_and_resume_order_response_shape(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $createResponse = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $orderId = $createResponse->json('order.id');

        $holdResponse = $this->postJson("/api/orders/{$orderId}/hold");
        $holdResponse->assertOk();
        $this->assertMatchesApiSnapshot($holdResponse, 'order.hold');

        $resumeResponse = $this->postJson("/api/orders/{$orderId}/resume");
        $resumeResponse->assertOk();
        $this->assertMatchesApiSnapshot($resumeResponse, 'order.resume');
    }

    public function test_kds_orders_list_shape(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson('/api/orders', [
            'type' => 'dine_in',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $response = $this->getJson('/api/kds/orders?status=pending');
        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'kds.orders.list');
    }

    public function test_order_number_format(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $orderNumber = $response->json('order.order_number');
        $this->assertMatchesRegularExpression('/^BG-\d{8}-\d{4}$/', $orderNumber);
    }

    public function test_prices_are_sourced_from_db_not_client(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'quantity' => 1,
                    'unit_price' => 0.01,
                ],
            ],
        ]);

        $response->assertCreated();
        $this->assertEquals('22.00', $response->json('order.items.0.unit_price'));
    }
}
