<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Services\ReportsService;
use App\Domains\Trade\Services\WholesaleChannelAggregator;
use App\Models\Category;
use App\Models\Customer;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\Role;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeInvoiceAllocation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Stage F — payment-basis wholesale recognition (the path only invoice-basis tests missed).
 *
 * Hybrid routes to the invoice path in WholesaleChannelAggregator::recognizesOnPayment()
 * (payment AND NOT tax-invoice → false when hybrid posts on both). Covered explicitly below.
 */
class TradeReportsStageFPaymentBasisTest extends TestCase
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

        $this->setAccountingBasis('payment');

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'f-pay-owner@test.local', 'phone' => '7744101',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Pay Basis Shop', 'phone' => '+9607744101', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active',
            'credit_limit_laar' => 5_000_000, 'credit_balance_laar' => 0,
        ]);
        $this->account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Pay Basis Shop',
            'is_active' => true,
            'missing_policy' => TradeAccount::MISSING_CHARGE,
        ]);

        $cat = Category::create(['name' => 'Trade F Pay', 'slug' => 'trade-f-pay', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Momo set pay',
            'base_price' => 100, 'cost' => 40, 'sku' => 'MOMO-FP',
            'is_active' => true, 'is_available' => true,
            'track_stock' => true, 'availability_type' => 'stock_based',
            'stock_quantity' => 500, 'wholesale_price_laar' => 8000,
        ]);
    }

    private function setAccountingBasis(string $basis): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-FP',
            'taxable_activity_no' => 'TA-FP',
            'seller_name' => 'Bake & Grill',
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => true,
            'accounting_basis' => $basis,
            'invoice_prefix' => 'TI',
            'credit_note_prefix' => 'CN',
            'next_invoice_sequence' => 1,
            'next_credit_note_sequence' => 1,
        ]);
        app(GstSettingsService::class)->bust();
    }

    /**
     * Invoice total = qtySold * unitPrice. Full stamped COGS = qtySold * unitCost.
     *
     * @return array{0: Invoice, 1: int, 2: int} invoice, total_laar, full_cogs_laar
     */
    private function unpaidTradeInvoice(
        int $qtySold = 6,
        int $unitPrice = 5000,
        int $unitCost = 1000,
        ?Carbon $issueAt = null,
    ): array {
        $issueAt = $issueAt ?? now()->subDays(10);
        $delivery = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-FP-'.uniqid(),
            'status' => TradeDelivery::STATUS_INVOICED,
            'dispatched_at' => $issueAt->copy()->subDays(2),
            'reconciled_at' => $issueAt->copy(),
            'invoiced_at' => $issueAt->copy(),
            'idempotency_key' => 'fp-d-'.uniqid(),
        ]);
        $line = TradeDeliveryLine::create([
            'trade_delivery_id' => $delivery->id,
            'item_id' => $this->item->id,
            'qty_sent' => $qtySold,
            'unit_price_laar' => $unitPrice,
            'unit_cost_laar' => $unitCost,
            'qty_sold' => $qtySold,
            'qty_returned_waste' => 0,
            'qty_returned_good' => 0,
            'qty_missing' => 0,
            'reported_sold_qty' => $qtySold,
        ]);

        $totalLaar = $qtySold * $unitPrice;
        $fullCogs = $qtySold * $unitCost;
        $invoice = Invoice::create([
            'invoice_number' => 'TI-FP-'.uniqid(),
            'idempotency_key' => 'fp-inv-'.uniqid(),
            'type' => 'sale',
            'status' => 'sent',
            'is_tax_invoice' => true,
            'customer_id' => $this->customer->id,
            'trade_account_id' => $this->account->id,
            'subtotal_laar' => (int) round($totalLaar / 1.08),
            'tax_laar' => $totalLaar - (int) round($totalLaar / 1.08),
            'total_laar' => $totalLaar,
            'amount_paid_laar' => 0,
            'subtotal' => $totalLaar / 100,
            'tax_amount' => 0,
            'total' => $totalLaar / 100,
            'issue_date' => $issueAt->toDateString(),
            'due_date' => $issueAt->copy()->addDays(14)->toDateString(),
            'notes' => 'Wholesale consignment — charged to customer credit account.',
        ]);
        TradeInvoiceAllocation::create([
            'invoice_id' => $invoice->id,
            'trade_delivery_line_id' => $line->id,
            'qty_invoiced' => $qtySold,
            'amount_laar' => $totalLaar,
            'line_kind' => TradeInvoiceAllocation::KIND_SOLD,
        ]);
        $this->customer->update(['credit_balance_laar' => $totalLaar]);

        return [$invoice, $totalLaar, $fullCogs];
    }

    private function payInvoice(Invoice $invoice, int $amountLaar, Carbon $processedAt): Payment
    {
        $payment = Payment::create([
            'idempotency_key' => 'fp-pay-'.uniqid(),
            'order_id' => null,
            'invoice_id' => $invoice->id,
            'method' => 'cash',
            'amount' => $amountLaar / 100,
            'amount_laar' => $amountLaar,
            'status' => 'confirmed',
            'processed_at' => $processedAt,
        ]);
        $paid = (int) $invoice->amount_paid_laar + $amountLaar;
        $invoice->update([
            'amount_paid_laar' => $paid,
            'status' => $paid >= (int) $invoice->total_laar ? 'paid' : 'sent',
            'paid_at' => $paid >= (int) $invoice->total_laar ? $processedAt : null,
        ]);

        return $payment;
    }

    #[Test]
    public function payment_basis_unpaid_trade_invoice_contributes_zero_wholesale_revenue(): void
    {
        $this->assertTrue(app(WholesaleChannelAggregator::class)->recognizesOnPayment());

        [$invoice, $totalLaar] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $issueDay = Carbon::parse($invoice->issue_date)->startOfDay();
        $today = now()->startOfDay();

        $onIssueDay = app(ReportsService::class)->salesSummary($issueDay, $issueDay->copy()->endOfDay());
        $onToday = app(ReportsService::class)->salesSummary($today, $today->copy()->endOfDay());

        $this->assertSame(0, $onIssueDay['wholesale']['revenue_laar']);
        $this->assertSame(0, $onIssueDay['wholesale']['invoices_count']);
        $this->assertSame(0, $onIssueDay['wholesale']['cogs_laar']);
        $this->assertSame(0, $onToday['wholesale']['revenue_laar']);
        $this->assertSame(0, $onToday['wholesale']['cogs_laar']);
        $this->assertGreaterThan(0, $totalLaar);

        Sanctum::actingAs($this->owner, ['staff']);
        $pnl = $this->getJson('/api/reports/finance/profit-and-loss?from='.$today->toDateString().'&to='.$today->toDateString())
            ->assertOk()->json();
        $this->assertSame(0, (int) round(((float) $pnl['revenue']['wholesale']) * 100));
    }

    #[Test]
    public function payment_basis_recognises_full_revenue_in_payment_period_not_issue_period(): void
    {
        [$invoice, $totalLaar, $fullCogs] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $payAt = now()->subDay(); // deliberately different from issue
        $this->payInvoice($invoice, $totalLaar, $payAt);

        $issueDay = Carbon::parse($invoice->issue_date)->startOfDay();
        $payDay = $payAt->copy()->startOfDay();

        $issueSummary = app(ReportsService::class)->salesSummary($issueDay, $issueDay->copy()->endOfDay());
        $paySummary = app(ReportsService::class)->salesSummary($payDay, $payDay->copy()->endOfDay());

        $this->assertSame(0, $issueSummary['wholesale']['revenue_laar']);
        $this->assertSame(0, $issueSummary['wholesale']['cogs_laar']);
        $this->assertSame($totalLaar, $paySummary['wholesale']['revenue_laar']);
        $this->assertSame(1, $paySummary['wholesale']['invoices_count']);
        $this->assertSame($fullCogs, $paySummary['wholesale']['cogs_laar']);

        Sanctum::actingAs($this->owner, ['staff']);
        $daily = $this->getJson('/api/reports/finance/daily-summary?date='.$payDay->toDateString())
            ->assertOk()->json();
        $this->assertSame($totalLaar, (int) round(((float) $daily['wholesale_revenue']) * 100));

        $dailyIssue = $this->getJson('/api/reports/finance/daily-summary?date='.$issueDay->toDateString())
            ->assertOk()->json();
        $this->assertSame(0, (int) round(((float) $dailyIssue['wholesale_revenue']) * 100));
    }

    #[Test]
    public function payment_basis_part_paid_apportions_revenue_and_cogs(): void
    {
        // Hand-worked: 6 × 5000 = 30_000 total; 6 × 1000 = 6_000 full COGS.
        // Pay 10_000 → revenue 10_000; COGS = ROUND(6000 * 10000 / 30000) = 2000.
        // Wrong (no apportion) would yield COGS 6000; wrong half would yield 3000.
        [$invoice, $totalLaar, $fullCogs] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $this->assertSame(30000, $totalLaar);
        $this->assertSame(6000, $fullCogs);

        $payAt = now();
        $this->payInvoice($invoice, 10000, $payAt);

        $summary = app(ReportsService::class)->salesSummary($payAt->copy()->startOfDay(), $payAt->copy()->endOfDay());
        $this->assertSame(10000, $summary['wholesale']['revenue_laar']);
        $this->assertSame(1, $summary['wholesale']['invoices_count']);
        $this->assertSame(2000, $summary['wholesale']['cogs_laar']);
        $this->assertNotSame($fullCogs, $summary['wholesale']['cogs_laar']);
    }

    #[Test]
    public function payment_basis_second_payment_settles_remainder_without_double_count(): void
    {
        [$invoice, $totalLaar, $fullCogs] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $day1 = now()->subDays(2);
        $day2 = now();

        $this->payInvoice($invoice, 10000, $day1);
        $this->payInvoice($invoice, 20000, $day2);

        $s1 = app(ReportsService::class)->salesSummary($day1->copy()->startOfDay(), $day1->copy()->endOfDay());
        $s2 = app(ReportsService::class)->salesSummary($day2->copy()->startOfDay(), $day2->copy()->endOfDay());
        $span = app(ReportsService::class)->salesSummary($day1->copy()->startOfDay(), $day2->copy()->endOfDay());

        $this->assertSame(10000, $s1['wholesale']['revenue_laar']);
        $this->assertSame(2000, $s1['wholesale']['cogs_laar']);
        $this->assertSame(20000, $s2['wholesale']['revenue_laar']);
        $this->assertSame(4000, $s2['wholesale']['cogs_laar']);

        $this->assertSame($totalLaar, $s1['wholesale']['revenue_laar'] + $s2['wholesale']['revenue_laar']);
        $this->assertSame($fullCogs, $s1['wholesale']['cogs_laar'] + $s2['wholesale']['cogs_laar']);
        $this->assertSame($totalLaar, $span['wholesale']['revenue_laar']);
        $this->assertSame($fullCogs, $span['wholesale']['cogs_laar']);
        $this->assertSame(1, $span['wholesale']['invoices_count']);
    }

    #[Test]
    public function payment_basis_top_items_and_revenue_by_day_follow_payment_date(): void
    {
        [$invoice, $totalLaar] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $payAt = now()->subDay();
        $this->payInvoice($invoice, $totalLaar, $payAt);

        $agg = app(WholesaleChannelAggregator::class);
        $issueDay = Carbon::parse($invoice->issue_date)->startOfDay();
        $payDay = $payAt->copy()->startOfDay();

        $this->assertSame([], $agg->topItems($issueDay, $issueDay->copy()->endOfDay()));
        $items = $agg->topItems($payDay, $payDay->copy()->endOfDay());
        $this->assertCount(1, $items);
        $this->assertSame('wholesale', $items[0]['channel']);
        $this->assertSame($totalLaar, (int) round(((float) $items[0]['total']) * 100));

        $byDayIssue = $agg->revenueByDay($issueDay, $issueDay->copy()->endOfDay());
        $byDayPay = $agg->revenueByDay($payDay, $payDay->copy()->endOfDay());
        $this->assertSame([], $byDayIssue);
        $this->assertArrayHasKey($payDay->toDateString(), $byDayPay);
        $this->assertSame($totalLaar, (int) round(((float) $byDayPay[$payDay->toDateString()]) * 100));
    }

    #[Test]
    public function hybrid_basis_uses_invoice_path_not_payment_path(): void
    {
        // Hybrid: shouldPostOrderOnPayment && shouldPostOnTaxInvoice → recognizesOnPayment() === false.
        $this->setAccountingBasis('hybrid');
        $agg = app(WholesaleChannelAggregator::class);
        $this->assertFalse($agg->recognizesOnPayment());

        [$invoice, $totalLaar] = $this->unpaidTradeInvoice(6, 5000, 1000, now()->subDays(10));
        $issueDay = Carbon::parse($invoice->issue_date)->startOfDay();
        $today = now()->startOfDay();

        // Unpaid still counts on issue date (invoice path) — the opposite of payment basis.
        $onIssue = app(ReportsService::class)->salesSummary($issueDay, $issueDay->copy()->endOfDay());
        $onToday = app(ReportsService::class)->salesSummary($today, $today->copy()->endOfDay());
        $this->assertSame($totalLaar, $onIssue['wholesale']['revenue_laar']);
        $this->assertSame(0, $onToday['wholesale']['revenue_laar']);

        // A payment today must not double-count on hybrid/invoice recognition.
        $this->payInvoice($invoice, 10000, now());
        $onTodayAfterPay = app(ReportsService::class)->salesSummary($today, $today->copy()->endOfDay());
        $this->assertSame(0, $onTodayAfterPay['wholesale']['revenue_laar']);
        $onIssueAfterPay = app(ReportsService::class)->salesSummary($issueDay, $issueDay->copy()->endOfDay());
        $this->assertSame($totalLaar, $onIssueAfterPay['wholesale']['revenue_laar']);
    }
}
