<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Invoice;
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
 * Send Bill creates a sale invoice; charging the order must mark that
 * invoice paid so /invoices/{token} no longer shows balance due.
 */
class InvoicePaymentSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;
    private Order $order;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'inv-pay-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Invoice Sync Item',
            'base_price' => 40.0,
            'sku' => 'INV-SYNC-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@invsync.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'InvSync POS', 'identifier' => 'INV-SYNC-POS', 'type' => 'pos', 'is_active' => true]);

        $this->order = Order::create([
            'order_number' => 'INV-SYNC-1001',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 40,
            'total' => 40,
            'total_laar' => 4000,
            'user_id' => $this->staffUser->id,
        ]);
        OrderItem::create([
            'order_id' => $this->order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'unit_price' => 40,
            'quantity' => 1,
            'total_price' => 40,
        ]);
    }

    public function test_charge_after_send_bill_marks_invoice_paid_and_clears_balance_due(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $bill = $this->postJson("/api/orders/{$this->order->id}/send-bill", [])
            ->assertOk();
        $invoiceId = (int) $bill->json('invoice.id');
        $link = (string) $bill->json('link');
        $this->assertStringContainsString('/invoices/', $link);

        $invoice = Invoice::findOrFail($invoiceId);
        $token = (string) $invoice->token;
        $this->assertNotEmpty($token);
        $this->assertNotSame('paid', $invoice->status);
        $this->assertSame(0, (int) $invoice->amount_paid_laar);
        $this->assertGreaterThan(0, $invoice->balanceDueLaar());

        $this->get('/invoices/'.$token)
            ->assertOk()
            ->assertSee('Something wrong with this bill?')
            ->assertSee('wa.me', false);

        $this->postJson("/api/orders/{$this->order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 40]],
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame((int) $invoice->total_laar, (int) $invoice->amount_paid_laar);
        $this->assertSame(0, $invoice->balanceDueLaar());

        $page = $this->get('/invoices/'.$token)->assertOk();
        $page->assertDontSee('Balance due');
        $page->assertSee('PAID', false);
        $page->assertDontSee('Something wrong with this bill?');
    }

    public function test_public_invoice_page_heals_stale_unpaid_invoice_when_order_already_paid(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $bill = $this->postJson("/api/orders/{$this->order->id}/send-bill", [])->assertOk();
        $invoiceId = (int) $bill->json('invoice.id');
        $token = (string) Invoice::findOrFail($invoiceId)->token;

        // Simulate the pre-fix state: order paid, invoice left open.
        $this->order->update([
            'status' => 'paid',
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);
        \App\Models\Payment::create([
            'order_id' => $this->order->id,
            'method' => 'cash',
            'amount' => 40,
            'amount_laar' => 4000,
            'status' => 'paid',
            'processed_at' => now(),
            'collected_by_user_id' => $this->staffUser->id,
        ]);

        $stale = Invoice::findOrFail($invoiceId);
        $stale->update([
            'status' => 'sent',
            'amount_paid_laar' => 0,
            'paid_at' => null,
        ]);

        $this->get('/invoices/'.$token)->assertOk()->assertDontSee('Balance due');

        $stale->refresh();
        $this->assertSame('paid', $stale->status);
        $this->assertSame(0, $stale->balanceDueLaar());
    }
}
