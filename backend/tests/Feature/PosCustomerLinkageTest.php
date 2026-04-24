<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wave D — POS customer linkage tests.
 *
 * Verifies that:
 *  1. POS order with customer_id appears in customer's order history
 *  2. POS order with customer_id updates customer's last_order_at
 *  3. POS order without customer_id does not leak into another customer's history
 *  4. Online and POS orders both appear in the unified customer history
 */
class PosCustomerLinkageTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private User $staffUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'pos-link-food', 'is_active' => true]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Link Test Item',
            'base_price' => 30.0,
            'sku' => 'LINK-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Linked Customer',
            'phone' => '+9607880001',
            'is_active' => true,
        ]);

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@link-test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'Link POS',
            'identifier' => 'LINK-POS-001',
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function createPosOrder(?int $customerId = null): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->staffUser, ['staff']);

        return $this->withHeader('X-Device-Identifier', 'LINK-POS-001')
            ->postJson('/api/orders', array_filter([
                'type' => 'takeaway',
                'customer_id' => $customerId,
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ], fn ($v) => $v !== null));
    }

    public function test_pos_order_with_customer_id_appears_in_history(): void
    {
        $posResponse = $this->createPosOrder($this->customer->id);
        $posResponse->assertCreated();

        $orderId = $posResponse->json('order.id');

        Sanctum::actingAs($this->customer, ['customer']);
        $historyResponse = $this->getJson('/api/customer/orders');
        $historyResponse->assertOk();

        $orderIds = collect($historyResponse->json('data'))->pluck('id')->all();
        $this->assertContains($orderId, $orderIds, 'POS order must appear in customer history');
    }

    public function test_pos_order_with_customer_updates_last_order_at(): void
    {
        $before = $this->customer->last_order_at;

        $this->createPosOrder($this->customer->id)->assertCreated();

        $this->customer->refresh();
        $this->assertNotNull($this->customer->last_order_at);
        $this->assertTrue(
            $this->customer->last_order_at->isAfter($before ?? now()->subMinute()),
            'last_order_at must be updated after POS order with customer',
        );
    }

    public function test_pos_order_without_customer_does_not_appear_in_history(): void
    {
        $posResponse = $this->createPosOrder(null);
        $posResponse->assertCreated();

        Sanctum::actingAs($this->customer, ['customer']);
        $historyResponse = $this->getJson('/api/customer/orders');
        $historyResponse->assertOk();

        $this->assertCount(0, $historyResponse->json('data'));
    }

    public function test_online_and_pos_orders_both_appear_in_unified_history(): void
    {
        // Online order
        Sanctum::actingAs($this->customer, ['customer']);
        $onlineResponse = $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $onlineResponse->assertCreated();
        $onlineId = $onlineResponse->json('order.id');

        // POS order with same customer
        $posResponse = $this->createPosOrder($this->customer->id);
        $posResponse->assertCreated();
        $posId = $posResponse->json('order.id');

        // Customer history should contain both
        Sanctum::actingAs($this->customer, ['customer']);
        $historyResponse = $this->getJson('/api/customer/orders');
        $historyResponse->assertOk();

        $orderIds = collect($historyResponse->json('data'))->pluck('id')->all();
        $this->assertContains($onlineId, $orderIds, 'Online order must appear in history');
        $this->assertContains($posId, $orderIds, 'POS order must appear in history');
    }

    public function test_pos_order_type_is_distinguishable_in_history(): void
    {
        // Online = online_pickup, POS = takeaway or dine_in
        $this->createPosOrder($this->customer->id)->assertCreated();

        Sanctum::actingAs($this->customer, ['customer']);
        $history = $this->getJson('/api/customer/orders')->json('data');

        $posOrders = array_filter($history, fn ($o) => $o['type'] === 'takeaway');
        $this->assertNotEmpty($posOrders, 'Takeaway POS order must be identifiable by type field');
    }
}
