<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Orders\Services\OrderCreationService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\SmsLog;
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

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
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
            'total_price' => 50,
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

    public function test_send_bill_after_order_edit_refreshes_invoice_and_allows_new_sms(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);

        $first = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])
            ->assertOk();
        $invoiceId = (int) $first->json('invoice.id');
        $this->assertGreaterThan(0.0, (float) $first->json('invoice.total'));

        $item = Item::where('sku', 'SB-1')->firstOrFail();
        app(OrderCreationService::class)->replaceOrderItems($this->order->fresh(), [
            [
                'item_id' => $item->id,
                'name' => $item->name,
                'quantity' => 2,
            ],
        ], reprintKitchen: false);

        $this->order->refresh();
        $newTotal = (float) $this->order->total;
        $this->assertGreaterThan(50.0, $newTotal, 'edited qty must raise the order total');

        // Saving changes should rewrite the open invoice (afterCommit).
        $invoice = Invoice::with('items')->findOrFail($invoiceId);
        $this->assertEqualsWithDelta($newTotal, (float) $invoice->total, 0.01);
        $this->assertSame(1, $invoice->items->count());
        $this->assertEqualsWithDelta(2.0, (float) $invoice->items->first()->quantity, 0.001);

        $second = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])
            ->assertOk();
        $this->assertSame($invoiceId, (int) $second->json('invoice.id'), 'invoice id stays stable');
        $this->assertEqualsWithDelta($newTotal, (float) $second->json('invoice.total'), 0.01);

        $smsBodies = SmsLog::where('reference_type', 'invoice')
            ->where('reference_id', (string) $invoiceId)
            ->orderBy('id')
            ->pluck('message')
            ->all();

        $this->assertCount(2, $smsBodies, 'edited total must allow a second bill SMS');
        $this->assertStringContainsString(number_format((float) $first->json('invoice.total'), 2), $smsBodies[0]);
        $this->assertStringContainsString(number_format($newTotal, 2), $smsBodies[1]);
        $this->assertStringNotContainsString('MVR 0.00', $smsBodies[1]);
    }

    public function test_send_bill_repairs_zero_order_total_from_line_items(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);

        // Corrupt header the way the mid-edit bug did, but leave priced lines.
        $this->order->update([
            'subtotal' => 0,
            'total' => 0,
            'subtotal_laar' => 0,
            'total_laar' => 0,
            'tax_amount' => 0,
            'tax_laar' => 0,
        ]);

        $res = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])
            ->assertOk();

        $billTotal = (float) $res->json('bill_total');
        $this->assertGreaterThan(0.0, $billTotal, 'bill_total must be repaired from line items');
        $this->assertGreaterThan(0.0, (float) $res->json('invoice.total'));

        $this->order->refresh();
        $this->assertGreaterThan(0.0, (float) $this->order->total);

        $sms = SmsLog::where('reference_type', 'invoice')
            ->where('reference_id', (string) $res->json('invoice.id'))
            ->latest('id')
            ->first();
        $this->assertNotNull($sms);
        $this->assertStringNotContainsString('MVR 0.00', (string) $sms->message);
        $this->assertStringContainsString(number_format($billTotal, 2), (string) $sms->message);
    }

    public function test_sync_refuses_to_wipe_invoice_when_order_total_is_zeroed(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])->assertOk();
        $invoiceId = (int) $res->json('invoice.id');
        $originalTotal = (float) $res->json('invoice.total');
        $this->assertGreaterThan(0.0, $originalTotal);

        // Corrupt the order the way the mid-edit bug did, but leave
        // the invoice alone — sync must refuse to copy zeros onto it.
        OrderItem::where('order_id', $this->order->id)->delete();
        $this->order->update(['subtotal' => 0, 'total' => 0, 'subtotal_laar' => 0, 'total_laar' => 0]);

        app(\App\Http\Controllers\Api\InvoiceController::class)
            ->syncOpenSaleInvoiceFromOrder($this->order->fresh());

        $invoice = Invoice::findOrFail($invoiceId);
        $this->assertEqualsWithDelta($originalTotal, (float) $invoice->total, 0.01);
        $this->assertGreaterThan(0, $invoice->items()->count());
    }
}
