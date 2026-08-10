<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Trade\Services\TradeReceivablePaymentService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeSalesReportSubmission;
use App\Models\User;
use App\Domains\Payments\Gateway\BmlConnectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Stage E — shop-facing trade screens (customer.token).
 * Fail-first: these tests were run before routes/services existed.
 */
class TradeShopFacingStageETest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $shopA;

    private Customer $shopB;

    private Customer $noTrade;

    private TradeAccount $accountA;

    private TradeAccount $accountB;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-E',
            'taxable_activity_no' => 'TA-E',
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
        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'e-owner@test.local', 'phone' => '7733001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->shopA = Customer::create([
            'name' => 'Shop A', 'phone' => '+9607733001', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active',
            'credit_limit_laar' => 5_000_000, 'credit_balance_laar' => 0,
            'credit_payment_terms_days' => 14,
        ]);
        $this->shopB = Customer::create([
            'name' => 'Shop B', 'phone' => '+9607733002', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active',
            'credit_limit_laar' => 5_000_000, 'credit_balance_laar' => 0,
        ]);
        $this->noTrade = Customer::create([
            'name' => 'Retail Only', 'phone' => '+9607733003', 'is_active' => true,
            'credit_enabled' => false,
        ]);

        $this->accountA = TradeAccount::create([
            'customer_id' => $this->shopA->id,
            'shop_name' => 'Shop A',
            'contact_phone' => '+9607733001',
            'is_active' => true,
            'payment_terms_days' => 14,
        ]);
        $this->accountB = TradeAccount::create([
            'customer_id' => $this->shopB->id,
            'shop_name' => 'Shop B',
            'contact_phone' => '+9607733002',
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Trade E', 'slug' => 'trade-e', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Momo set',
            'base_price' => 100.00,
            'cost' => 40.00,
            'sku' => 'MOMO-E',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 100,
            'wholesale_price_laar' => 8000,
        ]);
    }

    private function asShop(Customer $c): void
    {
        Sanctum::actingAs($c, ['customer']);
    }

    private function makeDelivery(TradeAccount $account, string $status = TradeDelivery::STATUS_DISPATCHED, int $qtySent = 10): TradeDelivery
    {
        $delivery = TradeDelivery::create([
            'trade_account_id' => $account->id,
            'delivery_number' => 'TD-E-'.uniqid(),
            'status' => $status,
            'dispatched_at' => now()->subDay(),
            'dispatched_by' => $this->owner->id,
            'idempotency_key' => 'e-d-'.uniqid(),
        ]);
        TradeDeliveryLine::create([
            'trade_delivery_id' => $delivery->id,
            'item_id' => $this->item->id,
            'qty_sent' => $qtySent,
            'unit_price_laar' => 5000,
            'unit_cost_laar' => 2500,
            'qty_sold' => $status === TradeDelivery::STATUS_DISPATCHED ? 0 : 7,
        ]);

        return $delivery->fresh(['lines.item']);
    }

    private function makeInvoice(TradeAccount $account, Customer $customer, int $totalLaar = 40000, int $paidLaar = 0): Invoice
    {
        return Invoice::create([
            'invoice_number' => 'TI-E-'.uniqid(),
            'idempotency_key' => 'e-inv-'.uniqid(),
            'type' => 'sale',
            'status' => $paidLaar >= $totalLaar ? 'paid' : 'sent',
            'is_tax_invoice' => true,
            'customer_id' => $customer->id,
            'trade_account_id' => $account->id,
            'subtotal_laar' => (int) round($totalLaar / 1.08),
            'tax_laar' => $totalLaar - (int) round($totalLaar / 1.08),
            'total_laar' => $totalLaar,
            'amount_paid_laar' => $paidLaar,
            'subtotal' => round($totalLaar / 100, 2),
            'tax_amount' => 0,
            'total' => round($totalLaar / 100, 2),
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(14)->toDateString(),
            'notes' => 'Wholesale consignment — charged to customer credit account.',
        ]);
    }

    private function assertNoForbiddenShopFields(mixed $payload): void
    {
        $json = json_encode($payload, JSON_THROW_ON_ERROR);
        foreach ([
            'laari', 'unit_cost', 'exposure', 'has_mismatch', 'margin',
            'waste_cost', 'waste', 'self_reconciled', 'credit_override',
            'holding_unbilled', 'reconciled_by', 'mismatch',
        ] as $needle) {
            $this->assertStringNotContainsString(
                $needle,
                strtolower($json),
                "Shop payload must not contain '{$needle}'",
            );
        }
    }

    // ── Deliveries list / detail ───────────────────────────────────────────

    #[Test]
    public function deliveries_list_returns_own_shop_only_newest_first(): void
    {
        $older = $this->makeDelivery($this->accountA);
        $older->update(['dispatched_at' => now()->subDays(3), 'delivery_number' => 'TD-OLD']);
        $newer = $this->makeDelivery($this->accountA);
        $newer->update(['dispatched_at' => now()->subHour(), 'delivery_number' => 'TD-NEW']);
        $this->makeDelivery($this->accountB);

        $this->asShop($this->shopA);
        $res = $this->getJson('/api/customer/trade/deliveries')->assertOk();
        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertSame([$newer->id, $older->id], $ids);
        $this->assertNoForbiddenShopFields($res->json());
    }

    #[Test]
    public function deliveries_detail_idor_refuses_other_shop(): void
    {
        $b = $this->makeDelivery($this->accountB);
        $this->asShop($this->shopA);
        $this->getJson("/api/customer/trade/deliveries/{$b->id}")->assertNotFound();
    }

    #[Test]
    public function deliveries_list_empty_for_customer_without_trade_account(): void
    {
        $this->asShop($this->noTrade);
        $res = $this->getJson('/api/customer/trade/deliveries')->assertOk();
        $this->assertSame([], $res->json('data'));
        $this->assertNoForbiddenShopFields($res->json());
    }

    #[Test]
    public function me_exposes_has_trade_account_flag(): void
    {
        $this->asShop($this->shopA);
        $this->getJson('/api/customer/me')
            ->assertOk()
            ->assertJsonPath('has_trade_account', true);

        $this->asShop($this->noTrade);
        $this->getJson('/api/customer/me')
            ->assertOk()
            ->assertJsonPath('has_trade_account', false);
    }

    // ── Report sales ───────────────────────────────────────────────────────

    #[Test]
    public function report_sales_writes_claim_only_no_stock_money_or_invoice(): void
    {
        $delivery = $this->makeDelivery($this->accountA, TradeDelivery::STATUS_DISPATCHED, 10);
        $line = $delivery->lines->first();
        $stockBefore = StockMovement::count();
        $invBefore = Invoice::count();
        $ledgerBefore = CustomerCreditLedger::count();
        $payBefore = Payment::count();

        $this->asShop($this->shopA);
        $res = $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-1',
            'lines' => [
                ['line_id' => $line->id, 'sold_qty' => 6],
            ],
        ])->assertOk();

        $line->refresh();
        $delivery->refresh();
        $this->assertSame(6, (int) $line->reported_sold_qty);
        $this->assertSame(0, (int) $line->qty_sold);
        $this->assertSame(TradeDelivery::STATUS_DISPATCHED, $delivery->status);
        $this->assertSame($stockBefore, StockMovement::count());
        $this->assertSame($invBefore, Invoice::count());
        $this->assertSame($ledgerBefore, CustomerCreditLedger::count());
        $this->assertSame($payBefore, Payment::count());
        $this->assertTrue(TradeSalesReportSubmission::where('idempotency_key', 'rep-1')->exists());
        $this->assertNoForbiddenShopFields($res->json());
    }

    #[Test]
    public function report_sales_rejects_qty_above_sent(): void
    {
        $delivery = $this->makeDelivery($this->accountA, TradeDelivery::STATUS_DISPATCHED, 10);
        $line = $delivery->lines->first();
        $this->asShop($this->shopA);
        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-over',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 11]],
        ])->assertStatus(422);
        $this->assertNull($line->fresh()->reported_sold_qty);
    }

    #[Test]
    public function report_sales_refused_after_reconciled(): void
    {
        $delivery = $this->makeDelivery($this->accountA, TradeDelivery::STATUS_RECONCILED, 10);
        $line = $delivery->lines->first();
        $this->asShop($this->shopA);
        $res = $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-closed',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 5]],
        ])->assertStatus(422);
        $this->assertStringContainsString('checked', strtolower((string) $res->json('message')));
    }

    #[Test]
    public function report_sales_idor_refuses_other_shop_delivery(): void
    {
        $b = $this->makeDelivery($this->accountB);
        $line = $b->lines->first();
        $this->asShop($this->shopA);
        $this->postJson("/api/customer/trade/deliveries/{$b->id}/report-sales", [
            'idempotency_key' => 'rep-idor',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 1]],
        ])->assertNotFound();
    }

    #[Test]
    public function re_report_overwrites_and_records_both_submissions(): void
    {
        $delivery = $this->makeDelivery($this->accountA);
        $line = $delivery->lines->first();
        $this->asShop($this->shopA);

        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-a',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 4]],
        ])->assertOk();
        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-b',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 7]],
        ])->assertOk();

        $this->assertSame(7, (int) $line->fresh()->reported_sold_qty);
        $this->assertSame(2, TradeSalesReportSubmission::where('trade_delivery_id', $delivery->id)->count());
    }

    #[Test]
    public function duplicate_idempotency_key_records_once(): void
    {
        $delivery = $this->makeDelivery($this->accountA);
        $line = $delivery->lines->first();
        $this->asShop($this->shopA);
        $body = [
            'idempotency_key' => 'rep-dup',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 5]],
        ];
        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", $body)->assertOk();
        $this->postJson("/api/customer/trade/deliveries/{$delivery->id}/report-sales", [
            'idempotency_key' => 'rep-dup',
            'lines' => [['line_id' => $line->id, 'sold_qty' => 9]],
        ])->assertOk();

        $this->assertSame(1, TradeSalesReportSubmission::where('idempotency_key', 'rep-dup')->count());
        $this->assertSame(5, (int) $line->fresh()->reported_sold_qty);
    }

    // ── Statement / PDF / Pay ──────────────────────────────────────────────

    #[Test]
    public function statement_shows_own_balance_matching_ledger_without_forbidden_fields(): void
    {
        $invoice = $this->makeInvoice($this->accountA, $this->shopA, 40000, 0);
        $this->shopA->update(['credit_balance_laar' => 40000]);
        CustomerCreditLedger::create([
            'customer_id' => $this->shopA->id,
            'type' => 'charge',
            'amount_laar' => 40000,
            'balance_after_laar' => 40000,
            'invoice_id' => $invoice->id,
            'notes' => 'Wholesale invoice',
        ]);
        $other = $this->makeInvoice($this->accountB, $this->shopB, 99000, 0);

        $this->asShop($this->shopA);
        $res = $this->getJson('/api/customer/trade/statement')->assertOk();
        $this->assertEquals(400.0, (float) $res->json('statement.balance_owed_mvr'));
        $invIds = collect($res->json('statement.invoices'))->pluck('id')->all();
        $this->assertContains($invoice->id, $invIds);
        $this->assertNotContains($other->id, $invIds);
        $this->assertEquals(
            (int) $this->shopA->fresh()->credit_balance_laar,
            (int) round(((float) $res->json('statement.balance_owed_mvr')) * 100),
        );
        $this->assertNoForbiddenShopFields($res->json());
    }

    #[Test]
    public function statement_idor_empty_for_no_trade_and_cannot_see_other_invoices(): void
    {
        $this->makeInvoice($this->accountB, $this->shopB, 50000, 0);
        $this->asShop($this->noTrade);
        $res = $this->getJson('/api/customer/trade/statement')->assertOk();
        $this->assertSame([], $res->json('statement.invoices') ?? []);
        $this->assertEquals(0, (float) ($res->json('statement.balance_owed_mvr') ?? 0));
    }

    #[Test]
    public function invoice_pdf_idor_refuses_other_shop(): void
    {
        $inv = $this->makeInvoice($this->accountB, $this->shopB);
        $this->asShop($this->shopA);
        $this->get("/api/customer/trade/invoices/{$inv->id}/pdf")->assertNotFound();
    }

    #[Test]
    public function invoice_pdf_own_ok(): void
    {
        $inv = $this->makeInvoice($this->accountA, $this->shopA);
        $this->asShop($this->shopA);
        $this->get("/api/customer/trade/invoices/{$inv->id}/pdf")->assertOk();
    }

    #[Test]
    public function pay_invoice_idor_refuses_other_shop(): void
    {
        $inv = $this->makeInvoice($this->accountB, $this->shopB);
        $this->asShop($this->shopA);
        $this->postJson("/api/customer/trade/invoices/{$inv->id}/pay", [
            'idempotency_key' => 'pay-idor',
        ])->assertNotFound();
    }

    #[Test]
    public function pay_invoice_online_settles_once_on_duplicate_callback(): void
    {
        $invoice = $this->makeInvoice($this->accountA, $this->shopA, 40000, 0);
        $this->shopA->update(['credit_balance_laar' => 40000]);
        CustomerCreditLedger::create([
            'customer_id' => $this->shopA->id,
            'type' => 'charge',
            'amount_laar' => 40000,
            'balance_after_laar' => 40000,
            'invoice_id' => $invoice->id,
            'notes' => 'Wholesale invoice',
        ]);

        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn ($v) => (string) $v);
        $mock->shouldReceive('createPayment')->once()->andReturn([
            'url' => 'https://bml.test/pay/e1',
            'transactionId' => 'txn-e-1',
            'id' => 'txn-e-1',
        ]);
        $this->app->instance(BmlConnectService::class, $mock);

        $this->asShop($this->shopA);
        $res = $this->postJson("/api/customer/trade/invoices/{$invoice->id}/pay", [
            'idempotency_key' => 'pay-full-1',
        ])->assertOk();
        $this->assertSame('https://bml.test/pay/e1', $res->json('payment_url'));
        $paymentId = (int) $res->json('payment_id');

        $payment = Payment::findOrFail($paymentId);
        $payment->update(['status' => 'initiated', 'provider_transaction_id' => 'txn-e-1']);

        $svc = app(TradeReceivablePaymentService::class);
        $svc->settleConfirmedBmlPayment($payment, $this->owner);
        $svc->settleConfirmedBmlPayment($payment->fresh(), $this->owner);

        $this->assertSame(1, CustomerCreditLedger::where('payment_id', $payment->id)->where('type', 'payment')->count());
        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame(0, (int) $this->shopA->fresh()->credit_balance_laar);
    }

    #[Test]
    public function part_payment_leaves_invoice_outstanding(): void
    {
        $invoice = $this->makeInvoice($this->accountA, $this->shopA, 40000, 0);
        $this->shopA->update(['credit_balance_laar' => 40000]);
        CustomerCreditLedger::create([
            'customer_id' => $this->shopA->id,
            'type' => 'charge',
            'amount_laar' => 40000,
            'balance_after_laar' => 40000,
            'invoice_id' => $invoice->id,
            'notes' => 'Wholesale invoice',
        ]);

        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn ($v) => (string) $v);
        $mock->shouldReceive('createPayment')->once()->andReturn([
            'url' => 'https://bml.test/pay/part',
            'transactionId' => 'txn-e-part',
            'id' => 'txn-e-part',
        ]);
        $this->app->instance(BmlConnectService::class, $mock);

        $this->asShop($this->shopA);
        $res = $this->postJson("/api/customer/trade/invoices/{$invoice->id}/pay", [
            'amount_mvr' => 150,
            'idempotency_key' => 'pay-part-1',
        ])->assertOk();

        $payment = Payment::findOrFail((int) $res->json('payment_id'));
        $this->assertSame(15000, (int) $payment->amount_laar);
        $payment->update(['status' => 'initiated', 'provider_transaction_id' => 'txn-e-part']);

        app(TradeReceivablePaymentService::class)->settleConfirmedBmlPayment($payment, $this->owner);

        $invoice->refresh();
        $this->assertNotSame('paid', $invoice->status);
        $this->assertSame(25000, $invoice->balanceDueLaar());
        $this->assertSame(25000, (int) $this->shopA->fresh()->credit_balance_laar);
    }
}
