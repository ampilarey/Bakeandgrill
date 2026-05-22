<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * POST /api/orders/{id}/send-bill
 *
 * After the May-2026 refactor `phone` became optional:
 *   - phone provided → SMS log row written + customer link + invoice
 *   - phone omitted  → ensure invoice exists, return link only,
 *                      MUST NOT write an SMS log (POS "Print bill")
 *
 * We avoid mocking SmsService (Mockery state leaks across tests when
 * SQLite is the test DB) and instead assert on side effects in the
 * sms_logs table. SmsService falls into demo mode automatically when
 * Dhiraagu credentials aren't configured in the test env, so a real
 * row is written without hitting the network.
 */
class OrderSendBillTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;
    private User $staffUser;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'sb-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'SendBill Item',
            'base_price' => 50.0,
            'sku' => 'SB-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@sendbill.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'SB POS', 'identifier' => 'SB-POS', 'type' => 'pos', 'is_active' => true]);

        $this->order = Order::create([
            'order_number' => 'SB-1001',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 50,
            'total' => 50,
            'user_id' => $this->staffUser->id,
        ]);
        OrderItem::create([
            'order_id' => $this->order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'unit_price' => 50,
            'quantity' => 1,
            'total' => 50,
        ]);
    }

    public function test_send_bill_with_phone_sends_sms_and_returns_link(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123']);
        $res->assertOk();
        $res->assertJsonStructure(['order', 'invoice', 'link']);
        $this->assertStringContainsString('/invoices/', $res->json('link'));
        $this->assertNotNull($res->json('order.customer_id'), 'sendBill must link customer to order');

        // SmsService should have written an sms_logs row for this invoice.
        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'invoice',
            'to' => '+9607890123',
        ]);
    }

    public function test_send_bill_without_phone_returns_link_only_no_sms(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->postJson("/api/orders/{$this->order->id}/send-bill", []);
        $res->assertOk();
        $res->assertJsonStructure(['order', 'invoice', 'link']);
        $this->assertStringContainsString('/invoices/', $res->json('link'));

        // CRITICAL: no SMS row should be written.
        $this->assertDatabaseMissing('sms_logs', ['reference_type' => 'invoice']);
    }

    public function test_send_bill_is_idempotent_on_invoice_creation(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $r1 = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])->assertOk();
        $r2 = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])->assertOk();
        $this->assertSame($r1->json('invoice.id'), $r2->json('invoice.id'), 'invoice id must be stable across repeats');
    }

    public function test_send_bill_respects_pre_existing_customer_link(): void
    {
        $existing = Customer::create(['name' => 'Existing', 'phone' => '+9607777000', 'is_active' => true]);
        $this->order->update(['customer_id' => $existing->id]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        // Different phone passed in — must NOT clobber existing link.
        $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607888001'])->assertOk();

        $this->order->refresh();
        $this->assertSame($existing->id, $this->order->customer_id, 'pre-existing customer link must be preserved');
    }

    public function test_send_bill_rejects_invalid_phone_when_provided(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '!!!'])
            ->assertStatus(422);
    }
}
