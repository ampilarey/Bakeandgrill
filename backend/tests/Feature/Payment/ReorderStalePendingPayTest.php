<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Reproduces the reorder → "Nothing to pay" collision:
 * after BML pay, online orders sit at status=pending + payment_status=paid.
 * Initiating BML again on that id returns zero_balance (not "already paid",
 * because the kitchen status gate only checks paid/completed).
 *
 * Checkout must create a NEW order for a reorder; these tests pin the server
 * behaviour the client now guards against.
 */
class ReorderStalePendingPayTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private string $token;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $this->customer = Customer::create([
            'name' => 'Reorder Customer',
            'phone' => '+9607662001',
            'is_active' => true,
        ]);
        $this->token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $category = Category::create([
            'name' => 'Reorder Cat',
            'slug' => 'reorder-cat',
            'is_active' => true,
        ]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Reorder Roll',
            'base_price' => 21.08,
            'sku' => 'REORDER-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    private function auth(): array
    {
        return ['Authorization' => 'Bearer '.$this->token];
    }

    private function makePaidKitchenPendingOrder(): Order
    {
        $order = Order::create([
            'order_number' => 'REORDER-PAID-1',
            'type' => 'delivery',
            'status' => 'pending',
            'payment_status' => 'paid',
            'customer_id' => $this->customer->id,
            'subtotal' => 21.08,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 21.08,
            'total_laar' => 2108,
            'paid_at' => now(),
            'delivery_address_line1' => 'Plot 1',
            'delivery_island' => 'Malé',
            'delivery_contact_name' => 'Reorder Customer',
            'delivery_contact_phone' => '+9607662001',
        ]);

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 21.08,
            'total_price' => 21.08,
            'status' => 'pending',
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml',
            'amount' => 21.08,
            'amount_laar' => 2108,
            'status' => 'confirmed',
        ]);

        return $order->fresh();
    }

    public function test_initiate_bml_on_financially_paid_kitchen_pending_returns_zero_balance(): void
    {
        $order = $this->makePaidKitchenPendingOrder();

        $response = $this->postJson("/api/orders/{$order->id}/pay/bml", [], $this->auth());

        $response->assertStatus(422)
            ->assertJsonPath('code', 'zero_balance');
        $this->assertStringContainsString('fully covered', (string) $response->json('message'));
        // Must NOT instruct the customer to press a missing "Place order" button.
        $this->assertStringNotContainsString('Place order', (string) $response->json('message'));
    }

    public function test_initiate_bml_on_status_paid_returns_already_paid_not_zero_balance(): void
    {
        $order = $this->makePaidKitchenPendingOrder();
        $order->update(['status' => 'paid']);

        $response = $this->postJson("/api/orders/{$order->id}/pay/bml", [], $this->auth());

        $response->assertStatus(422);
        $this->assertSame('Order already paid', $response->json('message'));
        $this->assertNull($response->json('code'));
    }

    public function test_two_successive_identical_customer_orders_create_distinct_ids(): void
    {
        $payload = [
            'type' => 'online_pickup',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'customer_notes' => 'same cart twice',
        ];

        $first = $this->postJson('/api/customer/orders', $payload, $this->auth());
        $first->assertSuccessful();
        $id1 = (int) $first->json('order.id');

        $second = $this->postJson('/api/customer/orders', $payload, $this->auth());
        $second->assertSuccessful();
        $id2 = (int) $second->json('order.id');

        $this->assertNotSame(0, $id1);
        $this->assertNotSame(0, $id2);
        $this->assertNotSame($id1, $id2);
    }

    public function test_complete_zero_balance_on_gift_covered_order_succeeds_cleanly(): void
    {
        $order = Order::create([
            'order_number' => 'REORDER-ZERO-1',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 21.08,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 21.08,
            'total_laar' => 2108,
            'gift_card_discount_laar' => 2108,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 21.08,
            'total_price' => 21.08,
            'status' => 'pending',
        ]);

        $response = $this->postJson(
            "/api/orders/{$order->id}/complete-zero-balance",
            [],
            $this->auth(),
        );

        $response->assertOk();
        $fresh = $order->fresh();
        $this->assertSame('paid', $fresh->payment_status);
        $this->assertContains($fresh->status, ['pending', 'paid']);
    }
}
