<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Trade\Services\TradeCreditExposureService;
use App\Domains\Trade\Services\TradeDispatchService;
use App\Domains\Trade\Services\TradeInvoiceService;
use App\Domains\Trade\Services\TradeReceivablePaymentService;
use App\Domains\Trade\Services\TradeReconciliationService;
use App\Models\CashMovement;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\GstPeriodLock;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\TaxLedgerEntry;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeInvoiceAllocation;
use App\Models\TradePriceListEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TradeInvoiceStageDTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $cashier;

    private Customer $customer;

    private TradeAccount $account;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-TRADE',
            'taxable_activity_no' => 'TA-TRADE',
            'seller_name' => 'Bake & Grill',
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => true,
            'accounting_basis' => 'invoice',
            'invoice_prefix' => 'TI',
            'credit_note_prefix' => 'CN',
            'next_invoice_sequence' => 1,
            'next_credit_note_sequence' => 1,
        ]);
        app(GstSettingsService::class)->bust();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'ti-owner@test.local', 'phone' => '7722001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->manager = User::create([
            'name' => 'Manager', 'email' => 'ti-mgr@test.local', 'phone' => '7722002',
            'password' => Hash::make('password'), 'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->cashier = User::create([
            'name' => 'Cashier', 'email' => 'ti-cash@test.local', 'phone' => '7722003',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Island Mart',
            'phone' => '+9607722001',
            'tin' => 'C123456',
            'billing_address' => 'Male',
            'is_active' => true,
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => 5_000_000,
            'credit_balance_laar' => 0,
            'credit_payment_terms_days' => 30,
        ]);

        $this->account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Island Mart',
            'contact_phone' => '+9607722001',
            'missing_policy' => TradeAccount::MISSING_CHARGE,
            'settlement_mode' => TradeAccount::SETTLEMENT_SALE_OR_RETURN,
            'payment_terms_days' => 14,
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Trade', 'slug' => 'trade-inv', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Momo set',
            'base_price' => 100.00,
            'cost' => 40.00,
            'sku' => 'MOMO-TI',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 100,
            'wholesale_price_laar' => 8000,
        ]);

        TradePriceListEntry::create([
            'trade_account_id' => $this->account->id,
            'item_id' => $this->item->id,
            'variant_id' => null,
            'price_laar' => 5000,
            'is_active' => true,
        ]);
    }

    private function dispatchAndReconcile(int $qtySent = 10, int $sold = 7, int $returned = 2, int $missing = 1): TradeDelivery
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', [
            'trade_account_id' => $this->account->id,
            'idempotency_key' => 'd-'.uniqid(),
            'lines' => [['item_id' => $this->item->id, 'qty' => $qtySent]],
        ])->assertCreated();

        $deliveryId = (int) $res->json('delivery.id');
        $lineId = (int) $res->json('delivery.lines.0.id');

        // reported_sold must equal qty_sent - counted_return to avoid the
        // mismatch flag (that formula does not subtract missing). Physical
        // qty_sold is still qty_sent - return - missing.
        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => $qtySent - $returned,
                'counted_return_qty' => $returned,
                'qty_missing' => $missing,
                'return_action' => $returned > 0 ? 'accept_to_stock' : null,
                'return_condition' => $returned > 0 ? 'good' : null,
                'return_idempotency_key' => 'r-'.uniqid(),
            ]],
        ])->assertOk();

        $delivery = TradeDelivery::with('lines')->findOrFail($deliveryId);
        $this->assertSame($sold, (int) $delivery->lines->first()->qty_sold);

        return $delivery;
    }

    #[Test]
    public function dispatch_and_reconcile_post_no_tax_ledger_entry(): void
    {
        $before = TaxLedgerEntry::count();
        $this->dispatchAndReconcile();
        $this->assertSame($before, TaxLedgerEntry::count());
    }

    #[Test]
    public function invoice_uses_stamped_prices_even_after_price_list_changes(): void
    {
        $delivery = $this->dispatchAndReconcile();
        TradePriceListEntry::where('trade_account_id', $this->account->id)->update(['price_laar' => 9999]);

        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'inv-'.uniqid(),
        ])->assertCreated();

        // 7 sold + 1 missing @ 5000 = 40000
        $this->assertSame(40000, (int) $res->json('invoice.total_laar'));
        $invoice = Invoice::with('items')->findOrFail($res->json('invoice.id'));
        $this->assertTrue($invoice->items->contains(fn ($i) => str_starts_with($i->description, 'Sold:')));
        $this->assertTrue($invoice->items->contains(fn ($i) => str_starts_with($i->description, 'Not returned:')));
    }

    #[Test]
    public function delivery_line_cannot_be_invoiced_twice(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'inv-a-'.uniqid(),
        ])->assertCreated();

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'inv-b-'.uniqid(),
        ])->assertStatus(422);
    }

    #[Test]
    public function mismatch_blocks_invoice_until_resolved(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', [
            'trade_account_id' => $this->account->id,
            'idempotency_key' => 'mm-'.uniqid(),
            'lines' => [['item_id' => $this->item->id, 'qty' => 10]],
        ])->assertCreated();
        $deliveryId = (int) $res->json('delivery.id');
        $lineId = (int) $res->json('delivery.lines.0.id');

        // Shop said sold 8, counted return 1 → implied sold 9 → mismatch
        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 8,
                'counted_return_qty' => 1,
                'qty_missing' => 1,
                'return_action' => 'accept_to_stock',
                'return_condition' => 'good',
                'return_idempotency_key' => 'mmr-'.uniqid(),
            ]],
        ])->assertOk();

        $blocked = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$deliveryId],
            'idempotency_key' => 'inv-mm-'.uniqid(),
        ]);
        $blocked->assertStatus(422);
        $this->assertStringContainsString('mismatch', (string) $blocked->json('message'));

        $this->postJson("/api/trade/deliveries/{$deliveryId}/resolve-mismatch", [
            'decision' => 'Accept shop report; count error on our side.',
        ])->assertOk();

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$deliveryId],
            'idempotency_key' => 'inv-mm-ok-'.uniqid(),
        ])->assertCreated();
    }

    #[Test]
    public function missing_policy_charge_write_off_and_dispute(): void
    {
        // charge (default) — missing on invoice
        $d1 = $this->dispatchAndReconcile(10, 7, 2, 1);
        Sanctum::actingAs($this->owner, ['staff']);
        $inv1 = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$d1->id],
            'idempotency_key' => 'pol-charge-'.uniqid(),
        ])->assertCreated();
        $this->assertSame(40000, (int) $inv1->json('invoice.total_laar'));

        // write_off — missing not invoiced
        $this->account->update(['missing_policy' => TradeAccount::MISSING_WRITE_OFF]);
        $d2 = $this->dispatchAndReconcile(10, 7, 2, 1);
        $inv2 = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$d2->id],
            'idempotency_key' => 'pol-wo-'.uniqid(),
        ])->assertCreated();
        $this->assertSame(35000, (int) $inv2->json('invoice.total_laar')); // 7*5000 only

        // dispute — blocked
        $this->account->update(['missing_policy' => TradeAccount::MISSING_DISPUTE]);
        $d3 = $this->dispatchAndReconcile(10, 7, 2, 1);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$d3->id],
            'idempotency_key' => 'pol-disp-'.uniqid(),
        ])->assertStatus(422);
    }

    #[Test]
    public function invoice_posts_exactly_one_ledger_charge(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'led-'.uniqid(),
        ])->assertCreated();

        $charges = CustomerCreditLedger::where('customer_id', $this->customer->id)->where('type', 'charge')->get();
        $this->assertCount(1, $charges);
        $this->assertSame(40000, (int) $charges->first()->amount_laar);
        $this->customer->refresh();
        $this->assertSame(40000, (int) $this->customer->credit_balance_laar);
    }

    #[Test]
    public function exposure_correct_in_dispatched_reconciled_and_invoiced_states(): void
    {
        $svc = app(TradeCreditExposureService::class);

        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', [
            'trade_account_id' => $this->account->id,
            'idempotency_key' => 'ex-'.uniqid(),
            'lines' => [['item_id' => $this->item->id, 'qty' => 10]],
        ])->assertCreated();
        $deliveryId = (int) $res->json('delivery.id');
        $lineId = (int) $res->json('delivery.lines.0.id');

        $ex1 = $svc->forCustomer($this->customer->fresh());
        $this->assertSame(0, $ex1->balanceOwedLaar);
        $this->assertSame(50000, $ex1->holdingUnbilledLaar); // 10*5000

        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 8, // sent - return (no mismatch)
                'counted_return_qty' => 2,
                'qty_missing' => 1,
                'return_action' => 'accept_to_stock',
                'return_condition' => 'good',
                'return_idempotency_key' => 'exr-'.uniqid(),
            ]],
        ])->assertOk();

        $ex2 = $svc->forCustomer($this->customer->fresh());
        $this->assertSame(0, $ex2->balanceOwedLaar);
        $this->assertSame(40000, $ex2->holdingUnbilledLaar); // 7+1 * 5000

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$deliveryId],
            'idempotency_key' => 'ex-inv-'.uniqid(),
        ])->assertCreated();

        $ex3 = $svc->forCustomer($this->customer->fresh());
        $this->assertSame(40000, $ex3->balanceOwedLaar);
        $this->assertSame(0, $ex3->holdingUnbilledLaar); // no double count
        $this->assertSame(40000, $ex3->exposureLaar);
    }

    #[Test]
    public function concurrent_dispatch_second_refused_under_lock(): void
    {
        // Limit fits exactly one 10×5000 delivery.
        $this->customer->update(['credit_limit_laar' => 50000]);
        $svc = app(TradeDispatchService::class);
        $wins = 0;
        $losses = 0;

        for ($i = 0; $i < 2; $i++) {
            try {
                DB::transaction(function () use ($svc, &$wins) {
                    // Same critical section as production: lock customer, assert, mutate.
                    $svc->dispatch(
                        $this->account->fresh(),
                        [['item_id' => $this->item->id, 'qty' => 10]],
                        $this->owner,
                        'race-'.uniqid(),
                    );
                    $wins++;
                });
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $this->assertSame(422, $e->getStatusCode());
                $this->assertStringContainsString('credit limit', $e->getMessage());
                $losses++;
            }
        }

        $this->assertSame(1, $wins);
        $this->assertSame(1, $losses);
        $this->assertSame(1, TradeDelivery::where('status', TradeDelivery::STATUS_DISPATCHED)->count());
    }

    #[Test]
    public function gst_posts_at_invoice_with_extracted_tax_and_locked_period_redirect(): void
    {
        $delivery = $this->dispatchAndReconcile();
        $issueMonth = now()->format('Y-m');
        GstPeriodLock::query()->create([
            'period_key' => $issueMonth,
            'locked_at' => now(),
            'locked_by' => $this->owner->id,
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'gst-'.uniqid(),
        ])->assertCreated();

        $invoice = Invoice::findOrFail($res->json('invoice.id'));
        // Inclusive 40000 @ 8%: tax = round(40000 * 800 / 10800) = 2963
        $this->assertSame(2963, (int) $invoice->tax_laar);
        $this->assertSame(40000 - 2963, (int) $invoice->subtotal_laar);

        $entry = TaxLedgerEntry::where('source_type', 'invoice')->where('source_id', $invoice->id)->first();
        $this->assertNotNull($entry);
        $this->assertNotSame($issueMonth, $entry->period_key);
        $this->assertNotNull($invoice->gst_period_key);
        $this->assertTrue($invoice->gstPeriodDiffersFromIssue());
    }

    #[Test]
    public function part_payment_then_settle(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $inv = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'pay-'.uniqid(),
        ])->assertCreated();
        $invoiceId = (int) $inv->json('invoice.id');

        Shift::create([
            'user_id' => $this->owner->id,
            'opened_at' => now(),
            'opening_cash' => 0,
        ]);

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/payments", [
            'customer_id' => $this->customer->id,
            'amount_laar' => 15000,
            'method' => 'cash',
            'idempotency_key' => 'p1-'.uniqid(),
            'invoice_ids' => [$invoiceId],
        ])->assertCreated();

        $invoice = Invoice::findOrFail($invoiceId);
        $this->assertSame(15000, (int) $invoice->amount_paid_laar);
        $this->assertSame('sent', $invoice->status);
        $this->customer->refresh();
        $this->assertSame(25000, (int) $this->customer->credit_balance_laar);

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/payments", [
            'customer_id' => $this->customer->id,
            'amount_laar' => 25000,
            'method' => 'cash',
            'idempotency_key' => 'p2-'.uniqid(),
            'invoice_ids' => [$invoiceId],
        ])->assertCreated();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->customer->refresh();
        $this->assertSame(0, (int) $this->customer->credit_balance_laar);
    }

    #[Test]
    public function cash_payment_appears_in_shift_as_credit_repayment(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $inv = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'cash-'.uniqid(),
        ])->assertCreated();

        $shift = Shift::create([
            'user_id' => $this->owner->id,
            'opened_at' => now(),
            'opening_cash' => 0,
        ]);

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/payments", [
            'customer_id' => $this->customer->id,
            'amount_laar' => 40000,
            'method' => 'cash',
            'idempotency_key' => 'cashp-'.uniqid(),
            'invoice_ids' => [(int) $inv->json('invoice.id')],
        ])->assertCreated();

        $this->assertTrue(
            CashMovement::where('shift_id', $shift->id)
                ->where('category', 'credit_repayment')
                ->where('amount', 400.00)
                ->exists()
        );
    }

    #[Test]
    public function duplicate_bml_callback_settles_once(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $invRes = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'bml-'.uniqid(),
        ])->assertCreated();
        $invoice = Invoice::findOrFail($invRes->json('invoice.id'));

        $payment = Payment::create([
            'idempotency_key' => 'bml-pay-'.uniqid(),
            'order_id' => null,
            'invoice_id' => $invoice->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 400.00,
            'amount_laar' => 40000,
            'status' => 'initiated',
            'provider_transaction_id' => 'txn-dup-1',
            'processed_at' => now(),
        ]);

        $svc = app(TradeReceivablePaymentService::class);
        $svc->settleConfirmedBmlPayment($payment, $this->owner);
        $svc->settleConfirmedBmlPayment($payment->fresh(), $this->owner);

        $this->assertSame(1, CustomerCreditLedger::where('payment_id', $payment->id)->where('type', 'payment')->count());
        $this->customer->refresh();
        $this->assertSame(0, (int) $this->customer->credit_balance_laar);
        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
    }

    #[Test]
    public function existing_order_payments_keep_order_id_after_schema_change(): void
    {
        $order = \App\Models\Order::create([
            'order_number' => 'ORD-KEEP-1',
            'type' => 'pos',
            'status' => 'paid',
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
            'total_laar' => 1000,
        ]);
        $payment = Payment::create([
            'idempotency_key' => 'ord-pay-'.uniqid(),
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 10,
            'amount_laar' => 1000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        $this->assertNotNull($payment->fresh()->order_id);
        $this->assertNull($payment->fresh()->invoice_id);
        $this->assertSame(0, Payment::whereNull('order_id')->whereNull('invoice_id')->count());
    }

    #[Test]
    public function credit_note_reverses_ledger_and_frees_allocation(): void
    {
        $delivery = $this->dispatchAndReconcile();
        Sanctum::actingAs($this->owner, ['staff']);
        $invRes = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'cn-'.uniqid(),
        ])->assertCreated();
        $invoiceId = (int) $invRes->json('invoice.id');

        $this->assertGreaterThan(0, TradeInvoiceAllocation::where('invoice_id', $invoiceId)->count());

        $this->postJson("/api/admin/trade-invoices/{$invoiceId}/credit-note", [
            'credit_note_reason' => 'Over-invoiced — reverse and rebill.',
        ])->assertCreated();

        $this->assertSame(0, TradeInvoiceAllocation::where('invoice_id', $invoiceId)->count());
        $this->customer->refresh();
        $this->assertSame(0, (int) $this->customer->credit_balance_laar);
        $delivery->refresh();
        $this->assertSame(TradeDelivery::STATUS_RECONCILED, $delivery->status);

        // Can invoice again
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'cn-re-'.uniqid(),
        ])->assertCreated();
    }

    #[Test]
    public function trade_invoice_permission_is_owner_only_by_default(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [1],
            'idempotency_key' => 'perm-m',
        ])->assertForbidden();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [1],
            'idempotency_key' => 'perm-c',
        ])->assertForbidden();
    }

    #[Test]
    public function dead_code_removed_and_allocation_cap_enforced(): void
    {
        $src = file_get_contents(app_path('Domains/Trade/Services/TradeReconciliationService.php'));
        $this->assertStringNotContainsString('Allow reported_sold to disagree with physical split', $src);

        $delivery = $this->dispatchAndReconcile();
        $line = $delivery->lines->first();
        // Manually over-allocate should be refused by service when raising a second partial… 
        // First invoice takes all; second fails (covered above). Cap unit check:
        TradeInvoiceAllocation::create([
            'invoice_id' => Invoice::create([
                'invoice_number' => 'CAP-1',
                'type' => 'sale',
                'status' => 'sent',
                'customer_id' => $this->customer->id,
                'trade_account_id' => $this->account->id,
                'subtotal_laar' => 0,
                'tax_laar' => 0,
                'total_laar' => 0,
                'issue_date' => now()->toDateString(),
            ])->id,
            'trade_delivery_line_id' => $line->id,
            'qty_invoiced' => 8, // sold+missing = 8
            'amount_laar' => 40000,
            'line_kind' => 'sold',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id],
            'idempotency_key' => 'cap-'.uniqid(),
        ])->assertStatus(422);
    }

    /**
     * Why Stage D missed LazyLoadingViolationException on TradeDeliveryLine::$delivery:
     * Illuminate\Database\Eloquent\Builder::hydrate() only copies the global
     * preventLazyLoading flag onto instances when count($items) > 1. Single-delivery
     * / single-line fixtures hydrate one row, so $line->delivery silently N+1'd.
     * Invoicing two deliveries eager-loads 2+ lines → flag is on → exception.
     */
    #[Test]
    public function invoiceable_qty_throws_when_delivery_relation_missing_on_multi_hydrate(): void
    {
        $d1 = $this->dispatchAndReconcile(5, 4, 1, 0);
        $d2 = $this->dispatchAndReconcile(5, 4, 1, 0);

        $lines = \App\Models\TradeDeliveryLine::query()
            ->whereIn('id', [
                (int) $d1->lines->first()->id,
                (int) $d2->lines->first()->id,
            ])
            ->get();

        $this->assertGreaterThanOrEqual(2, $lines->count());
        $line = $lines->first();
        $this->assertTrue($line->preventsLazyLoading, 'multi-hydrate must enable instance lazy-load prevention');
        $this->assertFalse($line->relationLoaded('delivery'));

        $this->expectException(\Illuminate\Database\LazyLoadingViolationException::class);
        app(TradeCreditExposureService::class)->invoiceableQty($line, $this->account);
    }

    #[Test]
    public function raising_one_invoice_for_two_deliveries_does_not_n_plus_one_delivery(): void
    {
        $d1 = $this->dispatchAndReconcile(5, 4, 1, 0);
        $d2 = $this->dispatchAndReconcile(5, 3, 2, 0);

        Sanctum::actingAs($this->owner, ['staff']);

        $byPkDeliverySelects = 0;
        DB::listen(function ($q) use (&$byPkDeliverySelects) {
            $sql = strtolower($q->sql);
            // Per-line lazy load / with('delivery') lookup — not the initial whereIn load.
            if (str_contains($sql, 'from "trade_deliveries"')
                && str_contains($sql, 'where "trade_deliveries"."id"')
                && ! str_contains($sql, 'where in')) {
                $byPkDeliverySelects++;
            }
        });

        $res = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$d1->id, $d2->id],
            'idempotency_key' => 'inv-multi-'.uniqid(),
        ])->assertCreated();

        // 4 sold + 3 sold @ 5000 = 35000
        $this->assertSame(35000, (int) $res->json('invoice.total_laar'));

        // Aggregation associates the in-hand delivery (0 queries). Remaining PK
        // selects come only from assertAllocationWithinCap's with('delivery') —
        // one per allocation row (2 sold lines → 2), not one per aggregation touch.
        // Pre-fix with lazy allowed: 2 (aggregation) + 2 (cap) = 4.
        $this->assertLessThanOrEqual(
            2,
            $byPkDeliverySelects,
            "expected ≤2 trade_deliveries PK selects after associating parent; got {$byPkDeliverySelects}",
        );
    }

    #[Test]
    public function ready_to_invoice_with_two_deliveries_does_not_lazy_load_delivery(): void
    {
        $this->dispatchAndReconcile(5, 4, 1, 0);
        $this->dispatchAndReconcile(5, 3, 2, 0);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/admin/trade-accounts/{$this->account->id}/ready-to-invoice")
            ->assertOk()
            ->assertJsonPath('data.0.invoiceable_laar', fn ($v) => (int) $v > 0);
    }
}
