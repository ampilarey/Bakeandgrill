<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeInvoiceAllocation;
use App\Models\TradePriceListEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Wholesale audit, 2026-09-26: credit notes that keep the shop's money,
 * write-offs that close invoices, mismatch decisions that set the bill,
 * chasing that does not stop, and a closed shop that can still pay.
 */
class TradeAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $customer;

    private TradeAccount $account;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-AUD', 'taxable_activity_no' => 'TA-AUD', 'seller_name' => 'Bake & Grill',
            'default_tax_rate_bp' => 800, 'tax_inclusive' => true, 'accounting_basis' => 'invoice',
            'invoice_prefix' => 'TI', 'credit_note_prefix' => 'CN', 'next_invoice_sequence' => 1, 'next_credit_note_sequence' => 1,
        ]);
        app(GstSettingsService::class)->bust();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'aud-owner@test.local', 'phone' => '7722001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Island Mart', 'phone' => '+9607722001', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active', 'credit_limit_laar' => 5_000_000,
            'credit_balance_laar' => 0, 'credit_payment_terms_days' => 30, 'credit_reminder_sms' => true,
        ]);
        $this->account = TradeAccount::create([
            'customer_id' => $this->customer->id, 'shop_name' => 'Island Mart', 'contact_phone' => '+9607722001',
            'missing_policy' => TradeAccount::MISSING_CHARGE, 'settlement_mode' => TradeAccount::SETTLEMENT_SALE_OR_RETURN,
            'billing_cycle' => TradeAccount::BILLING_WEEKLY, 'payment_terms_days' => 14, 'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Trade', 'slug' => 'trade-aud', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id, 'name' => 'Momo set', 'base_price' => 100.00, 'cost' => 40.00, 'sku' => 'MOMO-AUD',
            'is_active' => true, 'is_available' => true, 'track_stock' => true, 'availability_type' => 'stock_based',
            'stock_quantity' => 500, 'wholesale_price_laar' => 8000,
        ]);
        TradePriceListEntry::create(['trade_account_id' => $this->account->id, 'item_id' => $this->item->id, 'price_laar' => 5000, 'is_active' => true]);

        Sanctum::actingAs($this->owner, ['staff']);
    }

    /** Sent 10, sold 7, 2 back, 1 missing → 8 × 50.00 = MVR 400.00 under the charge policy. */
    private function dispatchAndReconcile(int $sent = 10, int $returned = 2, int $missing = 1, ?int $reported = null): TradeDelivery
    {
        $res = $this->postJson('/api/trade/deliveries/dispatch', [
            'trade_account_id' => $this->account->id, 'idempotency_key' => 'd-' . uniqid(),
            'lines' => [['item_id' => $this->item->id, 'qty' => $sent]],
        ])->assertCreated();
        $id = (int) $res->json('delivery.id');
        $this->postJson("/api/trade/deliveries/{$id}/reconcile", ['lines' => [[
            'line_id' => (int) $res->json('delivery.lines.0.id'),
            'reported_sold_qty' => $reported ?? $sent - $returned,
            'counted_return_qty' => $returned, 'qty_missing' => $missing,
            'return_action' => $returned > 0 ? 'accept_to_stock' : null, 'return_condition' => $returned > 0 ? 'good' : null,
            'return_idempotency_key' => 'r-' . uniqid(),
        ]]])->assertOk();

        return TradeDelivery::with('lines')->findOrFail($id);
    }

    private function invoice(TradeDelivery $delivery): Invoice
    {
        $res = $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", [
            'delivery_ids' => [$delivery->id], 'idempotency_key' => 'inv-' . uniqid(),
        ])->assertCreated();

        return Invoice::findOrFail((int) $res->json('invoice.id'));
    }

    private function pay(int $amountLaar, array $extra = []): \Illuminate\Testing\TestResponse
    {
        Shift::firstOrCreate(['user_id' => $this->owner->id, 'closed_at' => null], ['opened_at' => now(), 'opening_cash' => 0]);

        return $this->postJson("/api/admin/trade-accounts/{$this->account->id}/payments", array_merge([
            'customer_id' => $this->customer->id, 'amount_laar' => $amountLaar, 'method' => 'cash', 'idempotency_key' => 'p-' . uniqid(),
        ], $extra));
    }

    #[Test]
    public function a_credit_note_on_a_paid_invoice_leaves_the_shop_in_credit_and_settles_the_next_invoice(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());
        $this->pay(40000, ['invoice_ids' => [$invoice->id]])->assertCreated();
        $this->assertSame(0, (int) $this->customer->fresh()->credit_balance_laar);

        $this->postJson("/api/admin/trade-invoices/{$invoice->id}/credit-note", ['credit_note_reason' => 'Billed the wrong shop.'])->assertCreated();

        $this->assertSame(-40000, (int) $this->customer->fresh()->credit_balance_laar, 'the shop is in credit, not forgotten');
        $this->assertSame('void', $invoice->fresh()->status);
        $statement = $this->getJson("/api/admin/trade-accounts/{$this->account->id}/statement")->assertOk()->json('statement');
        $this->assertSame(40000, $statement['credit_in_hand_laar']);
        $this->assertSame(0, $statement['balance_owed_laar']);
        $this->assertSame(0, collect($statement['invoices'])->firstWhere('id', $invoice->id)['balance_laar']);

        // The next invoice is settled from that credit before anyone is asked for money.
        $next = $this->invoice($this->dispatchAndReconcile(10, 4, 0)); // 6 × 50.00 = 300.00
        $this->assertSame('paid', $next->status);
        $this->assertSame(30000, (int) $next->amount_paid_laar);
        $this->assertSame('credit_in_hand', $next->payment_method);
        $this->assertSame(-10000, (int) $this->customer->fresh()->credit_balance_laar);

        Sanctum::actingAs($this->customer->fresh(), ['customer']);
        $shop = $this->getJson('/api/customer/trade/statement')->assertOk()->json('statement');
        $this->assertSame(100.0, (float) $shop['credit_in_hand_mvr']);
        $this->assertSame(0.0, (float) $shop['balance_owed_mvr']);
    }

    #[Test]
    public function a_partial_credit_note_reduces_the_invoice_without_voiding_it(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());

        $this->postJson("/api/admin/trade-invoices/{$invoice->id}/credit-note", ['credit_note_reason' => 'Two boxes were stale.', 'amount_laar' => 10000])
            ->assertCreated()->assertJsonPath('invoice.status', 'sent')->assertJsonPath('invoice.balance_laar', 30000);
        $invoice->refresh();
        $this->assertSame(10000, (int) $invoice->credited_laar);
        $this->assertSame(30000, (int) $this->customer->fresh()->credit_balance_laar);
        $this->assertGreaterThan(0, TradeInvoiceAllocation::where('invoice_id', $invoice->id)->count(), 'goods stay billed');

        $this->postJson("/api/admin/trade-invoices/{$invoice->id}/credit-note", ['credit_note_reason' => 'Too much', 'amount_laar' => 30001])->assertStatus(422);

        // Crediting what is left voids it and frees the deliveries.
        $cn = $this->postJson("/api/admin/trade-invoices/{$invoice->id}/credit-note", ['credit_note_reason' => 'Cancel the rest.'])->assertCreated();
        $this->assertSame(30000, (int) $cn->json('credit_note.total_laar'));
        $this->assertSame('void', $invoice->fresh()->status);
        $this->assertSame(0, (int) $this->customer->fresh()->credit_balance_laar);
        $this->assertSame(0, TradeInvoiceAllocation::where('invoice_id', $invoice->id)->count());
    }

    #[Test]
    public function deactivating_a_shop_that_owes_needs_force_and_the_shop_keeps_read_and_pay_access(): void
    {
        $delivery = $this->dispatchAndReconcile();
        $invoice = $this->invoice($delivery);

        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/deactivate")
            ->assertStatus(422)->assertJsonPath('needs_force', true)->assertJsonPath('balance_owed_laar', 40000);
        $this->assertTrue($this->account->fresh()->is_active);
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/deactivate", ['force' => true])->assertOk()->assertJsonPath('trade_account.is_active', false);

        Sanctum::actingAs($this->customer->fresh(), ['customer']);
        $statement = $this->getJson('/api/customer/trade/statement')->assertOk()->json('statement');
        $this->assertFalse($statement['account_active']);
        $this->assertSame(400.0, (float) $statement['balance_owed_mvr']);
        $this->assertTrue(collect($statement['invoices'])->firstWhere('id', $invoice->id)['can_pay']);
        $this->getJson("/api/customer/trade/invoices/{$invoice->id}/pdf")->assertOk();
        $list = $this->getJson('/api/customer/trade/deliveries')->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->assertFalse($list->json('data.0.can_report_sales'));
        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", ['idempotency_key' => 'x', 'lines' => [['line_id' => $delivery->lines->first()->id, 'sold_qty' => 1]]])->assertNotFound();
    }

    #[Test]
    public function a_write_off_closes_the_invoices_it_covers(): void
    {
        $first = $this->invoice($this->dispatchAndReconcile());
        $second = $this->invoice($this->dispatchAndReconcile(10, 4, 0)); // 300.00
        $this->assertSame(70000, (int) $this->customer->fresh()->credit_balance_laar);

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/write-off", ['amount_laar' => 50000, 'reason' => 'Shop closed down, owner left the island.'])->assertCreated();

        $first->refresh();
        $second->refresh();
        $this->assertSame('paid', $first->status);
        $this->assertSame(40000, (int) $first->written_off_laar);
        $this->assertSame('WRITTEN OFF', $first->displayStatusLabel());
        $this->assertSame(10000, (int) $second->written_off_laar);
        $this->assertSame('sent', $second->status);
        $this->assertSame(20000, $second->balanceDueLaar());
        $this->assertSame(20000, (int) $this->customer->fresh()->credit_balance_laar);

        $ageing = collect($this->getJson('/api/admin/trade-reports/ageing')->assertOk()->json('rows'))->firstWhere('trade_account_id', $this->account->id);
        $this->assertSame(20000, $ageing['outstanding_laar'], 'the ageing report shows only what is still owed');
        $ledger = CustomerCreditLedger::where('method', 'writeoff')->firstOrFail();
        $this->assertSame([['invoice_id' => $first->id, 'amount_laar' => 40000], ['invoice_id' => $second->id, 'amount_laar' => 10000]], $ledger->applied_invoices);
    }

    #[Test]
    public function resolving_a_mismatch_can_bill_the_shops_count(): void
    {
        $this->account->update(['missing_policy' => TradeAccount::MISSING_WRITE_OFF]);
        // Sent 10, one back, one missing: we count 8 sold; the shop said 7.
        $delivery = $this->dispatchAndReconcile(10, 1, 1, reported: 7);
        $line = $delivery->lines->first();
        $this->assertTrue($delivery->has_mismatch);
        $this->assertSame(8, (int) $line->qty_sold);

        $ready = collect($this->getJson("/api/admin/trade-accounts/{$this->account->id}/ready-to-invoice")->assertOk()->json('data'))->firstWhere('id', $delivery->id);
        $this->assertTrue($ready['lines'][0]['mismatch']);
        $this->assertSame(7, $ready['lines'][0]['reported_sold_qty']);

        $this->postJson("/api/trade/deliveries/{$delivery->id}/resolve-mismatch", ['decision' => 'x', 'lines' => [['line_id' => $line->id, 'sold_qty' => 10]]])->assertStatus(422);

        $this->postJson("/api/trade/deliveries/{$delivery->id}/resolve-mismatch", [
            'decision' => 'Accept the shop count; our counter miscounted.',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 7]],
        ])->assertOk()->assertJsonPath('delivery.lines.0.qty_sold', 7)->assertJsonPath('delivery.lines.0.qty_missing', 2);

        $invoice = $this->invoice($delivery->fresh());
        $this->assertSame(35000, (int) $invoice->total_laar, '7 sold, the 2 missing are our loss under this policy');
    }

    #[Test]
    public function disputed_missing_stock_can_be_charged_as_well_as_waived(): void
    {
        $this->account->update(['missing_policy' => TradeAccount::MISSING_DISPUTE]);
        $delivery = $this->dispatchAndReconcile();
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", ['delivery_ids' => [$delivery->id], 'idempotency_key' => 'blocked'])->assertStatus(422);

        $this->postJson("/api/trade/deliveries/{$delivery->id}/charge-missing", ['reason' => 'They admitted the box went to the staff room.'])->assertOk();
        $ready = collect($this->getJson("/api/admin/trade-accounts/{$this->account->id}/ready-to-invoice")->assertOk()->json('data'))->firstWhere('id', $delivery->id);
        $this->assertTrue($ready['missing_charge_forced']);
        $this->assertFalse($ready['missing_blocking']);
        $this->assertSame(40000, $ready['invoiceable_laar']);

        $this->assertSame(40000, (int) $this->invoice($delivery->fresh())->total_laar, '7 sold + 1 missing charged');
    }

    #[Test]
    public function closed_credit_mode_blocks_dispatch_and_invoicing_but_not_repayment(): void
    {
        $delivery = $this->dispatchAndReconcile();
        $invoice = $this->invoice($delivery);

        SiteSetting::set('credit_accounts_mode', 'closed');
        SiteSetting::bust();
        $this->postJson('/api/trade/deliveries/dispatch', ['trade_account_id' => $this->account->id, 'idempotency_key' => 'closed-1', 'lines' => [['item_id' => $this->item->id, 'qty' => 1]]])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Credit accounts are closed — no new wholesale charges. Reopen credit in Settings → Credit accounts, or take payment up front.']);
        $second = $this->dispatchAndReconcileWhileOpen();
        $this->postJson("/api/admin/trade-accounts/{$this->account->id}/invoices", ['delivery_ids' => [$second->id], 'idempotency_key' => 'closed-2'])->assertStatus(422);
        $this->pay(40000, ['invoice_ids' => [$invoice->id]])->assertCreated();
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    private function dispatchAndReconcileWhileOpen(): TradeDelivery
    {
        SiteSetting::set('credit_accounts_mode', 'open');
        SiteSetting::bust();
        $d = $this->dispatchAndReconcile();
        SiteSetting::set('credit_accounts_mode', 'closed');
        SiteSetting::bust();

        return $d;
    }

    #[Test]
    public function account_terms_are_held_to_the_same_7_to_90_days_as_the_customer(): void
    {
        $this->patchJson("/api/admin/trade-accounts/{$this->account->id}", ['payment_terms_days' => 0])->assertStatus(422);
        $this->patchJson("/api/admin/trade-accounts/{$this->account->id}", ['payment_terms_days' => 400])->assertStatus(422);
        $this->patchJson("/api/admin/trade-accounts/{$this->account->id}", ['payment_terms_days' => 45])->assertOk()->assertJsonPath('trade_account.resolved_payment_terms_days', 45);
        $this->account->forceFill(['payment_terms_days' => 3])->save();
        $this->assertSame(7, $this->account->fresh()->resolvedPaymentTermsDays());
    }

    #[Test]
    public function overdue_reminders_repeat_and_still_reach_a_blocked_account(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());
        $due = now()->subDays(14)->startOfDay();
        $invoice->update(['due_date' => $due->toDateString(), 'status' => 'overdue']);
        $this->customer->update(['credit_enabled' => false, 'credit_status' => 'blocked']);

        $count = fn () => SmsLog::where('type', 'credit_payment_reminder')->count();
        $this->artisan('credit:send-payment-reminders', ['--date' => $due->copy()->addDays(3)->toDateString()])->assertSuccessful();
        $this->assertSame(1, $count(), 'day 3');
        $this->assertStringContainsString('3 days overdue', (string) SmsLog::where('type', 'credit_payment_reminder')->latest('id')->first()->message);
        $this->artisan('credit:send-payment-reminders', ['--date' => $due->copy()->addDays(5)->toDateString()])->assertSuccessful();
        $this->assertSame(1, $count(), 'nothing on day 5');
        $this->artisan('credit:send-payment-reminders', ['--date' => $due->copy()->addDays(7)->toDateString()])->assertSuccessful();
        $this->artisan('credit:send-payment-reminders', ['--date' => $due->copy()->addDays(14)->toDateString()])->assertSuccessful();
        $this->assertSame(3, $count(), 'every 7 days after that');

        SiteSetting::set('credit_overdue_reminder_every_days', '0');
        SiteSetting::bust();
        $this->artisan('credit:send-payment-reminders', ['--date' => $due->copy()->addDays(21)->toDateString()])->assertSuccessful();
        $this->assertSame(3, $count(), '0 switches the repeats off');
    }

    #[Test]
    public function owners_are_texted_once_at_30_and_once_at_60_days_overdue(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());
        $count = fn () => SmsLog::where('type', 'owner_trade_overdue')->count();

        $invoice->update(['due_date' => now()->subDays(10)->toDateString(), 'status' => 'overdue']);
        $this->artisan('trade:alert-overdue')->assertSuccessful();
        $this->assertSame(0, $count());

        $invoice->update(['due_date' => now()->subDays(31)->toDateString()]);
        $this->artisan('trade:alert-overdue')->assertSuccessful();
        $this->artisan('trade:alert-overdue')->assertSuccessful();
        $this->assertSame(1, $count());
        $this->assertStringContainsString('Island Mart: ' . $invoice->invoice_number . ' MVR 400.00 31 days', (string) SmsLog::where('type', 'owner_trade_overdue')->first()->message);
        $this->assertSame(30, (int) $invoice->fresh()->overdue_alert_stage);

        $invoice->update(['due_date' => now()->subDays(61)->toDateString()]);
        $this->artisan('trade:alert-overdue')->assertSuccessful();
        $this->assertSame(2, $count());
        $this->assertSame(60, (int) $invoice->fresh()->overdue_alert_stage);
    }

    #[Test]
    public function every_shop_with_a_balance_gets_a_monthly_statement_text(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());
        $invoice->update(['due_date' => now()->subDays(5)->toDateString(), 'status' => 'overdue']);
        $quiet = Customer::create(['name' => 'Quiet Shop', 'phone' => '+9607722009', 'is_active' => true, 'credit_enabled' => true, 'credit_status' => 'active', 'credit_limit_laar' => 100000]);
        TradeAccount::create(['customer_id' => $quiet->id, 'shop_name' => 'Quiet Shop', 'is_active' => true]);

        $this->artisan('trade:send-statements')->assertSuccessful();
        $this->artisan('trade:send-statements')->assertSuccessful();

        $texts = SmsLog::where('type', 'trade_statement_shop')->get();
        $this->assertCount(1, $texts, 'one shop, once');
        $this->assertSame('+9607722001', $texts->first()->to);
        $this->assertStringContainsString('Island Mart owes MVR 400.00, of which MVR 400.00 is overdue', (string) $texts->first()->message);
        $this->assertStringContainsString('/account/statement', (string) $texts->first()->message);
    }

    #[Test]
    public function shops_are_nudged_and_owners_alerted_about_deliveries_left_unreconciled(): void
    {
        $res = $this->postJson('/api/trade/deliveries/dispatch', ['trade_account_id' => $this->account->id, 'idempotency_key' => 'stale', 'lines' => [['item_id' => $this->item->id, 'qty' => 5]]])->assertCreated();
        $delivery = TradeDelivery::findOrFail((int) $res->json('delivery.id'));
        $delivery->update(['dispatched_at' => now()->subDays(4)]);

        $this->artisan('trade:chase-unreconciled')->assertSuccessful();
        $this->artisan('trade:chase-unreconciled')->assertSuccessful();
        $nudges = SmsLog::where('type', 'trade_report_reminder_shop')->get();
        $this->assertCount(1, $nudges);
        $this->assertStringContainsString('what sold from delivery ' . $delivery->delivery_number, (string) $nudges->first()->message);
        $this->assertStringContainsString('/account/deliveries/' . $delivery->id, (string) $nudges->first()->message);
        $this->assertNotNull($delivery->fresh()->sales_nudged_at);
        $this->assertSame(0, SmsLog::where('type', 'owner_trade_unreconciled')->count(), 'owners wait for the alert threshold');

        $delivery->update(['dispatched_at' => now()->subDays(8)]);
        $this->artisan('trade:chase-unreconciled')->assertSuccessful();
        $this->artisan('trade:chase-unreconciled')->assertSuccessful();
        $alerts = SmsLog::where('type', 'owner_trade_unreconciled')->get();
        $this->assertCount(1, $alerts);
        $this->assertStringContainsString($delivery->delivery_number . ' at Island Mart (8 days, MVR 250.00)', (string) $alerts->first()->message);
    }

    #[Test]
    public function a_shops_sales_report_texts_the_owners(): void
    {
        $res = $this->postJson('/api/trade/deliveries/dispatch', ['trade_account_id' => $this->account->id, 'idempotency_key' => 'rep', 'lines' => [['item_id' => $this->item->id, 'qty' => 5]]])->assertCreated();
        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson('/api/customer/trade/deliveries/' . $res->json('delivery.id') . '/report-sales', ['idempotency_key' => 'rep-1', 'lines' => [['line_id' => (int) $res->json('delivery.lines.0.id'), 'sold_qty' => 4]]])->assertOk();

        $texts = SmsLog::where('type', 'owner_trade_sales_reported')->get();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('Island Mart reported sales on ' . $res->json('delivery.delivery_number') . ': 4/5 Momo set', (string) $texts->first()->message);
    }

    #[Test]
    public function the_billing_cycle_prompts_the_owner_to_raise_an_invoice(): void
    {
        $this->dispatchAndReconcile();
        $this->artisan('trade:billing-reminder')->assertSuccessful();
        $this->artisan('trade:billing-reminder')->assertSuccessful();
        $texts = SmsLog::where('type', 'owner_trade_billing_due')->get();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('Island Mart MVR 400.00 (1 delivery)', (string) $texts->first()->message);
        $this->assertNotNull($this->account->fresh()->billing_reminded_at);

        // Weekly cycle: an invoice today means nothing is due for a week.
        $this->invoice($this->dispatchAndReconcile());
        $this->dispatchAndReconcile();
        $this->account->update(['billing_reminded_at' => null]);
        $this->artisan('trade:billing-reminder')->assertSuccessful();
        $this->assertSame(1, SmsLog::where('type', 'owner_trade_billing_due')->count());
    }

    #[Test]
    public function an_invoice_texts_the_shop_and_a_statement_payment_stays_on_trade_invoices(): void
    {
        // A till credit invoice on the same customer, older than the trade one.
        $pos = Invoice::create([
            'invoice_number' => 'POS-1', 'idempotency_key' => 'pos-1', 'type' => 'sale', 'status' => 'sent', 'customer_id' => $this->customer->id,
            'subtotal_laar' => 10000, 'tax_laar' => 0, 'total_laar' => 10000, 'amount_paid_laar' => 0, 'subtotal' => 100, 'tax_amount' => 0, 'total' => 100,
            'issue_date' => now()->subDays(5)->toDateString(), 'due_date' => now()->addDays(10)->toDateString(), 'notes' => 'Charged to customer credit account.',
        ]);
        $this->customer->update(['credit_balance_laar' => 10000]);

        $invoice = $this->invoice($this->dispatchAndReconcile());
        $text = SmsLog::where('type', 'trade_invoice_raised_shop')->firstOrFail();
        $this->assertSame('+9607722001', $text->to);
        $this->assertStringContainsString('invoice ' . $invoice->invoice_number . ' for Island Mart is MVR 400.00, due ' . $invoice->due_date->format('d M Y'), (string) $text->message);

        $this->pay(40000)->assertCreated();
        $this->assertSame('paid', $invoice->fresh()->status);
        $this->assertSame(0, (int) $pos->fresh()->amount_paid_laar, 'the till invoice is untouched');
        $statement = $this->getJson("/api/admin/trade-accounts/{$this->account->id}/statement")->assertOk()->json('statement');
        $this->assertSame([$invoice->id], $statement['payments'][0]['invoice_ids']);
        $this->assertSame([['invoice_id' => $invoice->id, 'amount_laar' => 40000]], $statement['payments'][0]['applied']);
    }

    #[Test]
    public function a_card_payment_on_the_statement_needs_a_reference_when_the_till_requires_one(): void
    {
        $invoice = $this->invoice($this->dispatchAndReconcile());
        SiteSetting::set('pos_card_reference_required', '1');
        SiteSetting::bust();
        $this->pay(40000, ['method' => 'card', 'invoice_ids' => [$invoice->id]])->assertStatus(422)->assertJsonValidationErrors(['reference']);
        $this->pay(40000, ['method' => 'card', 'invoice_ids' => [$invoice->id], 'reference' => 'TRM-4471'])->assertCreated();
    }
}
