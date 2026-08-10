<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Services\ReportsService;
use App\Domains\Trade\Services\TradeAnalyticsService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeInvoiceAllocation;
use App\Models\User;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Stage F — wholesale channel in core reports + owner analytics.
 * Fail-first: ran before WholesaleChannelAggregator was wired (missing wholesale keys).
 */
class TradeReportsStageFTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staffNoTrade;

    private Customer $customer;

    private TradeAccount $account;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'seller_tin' => 'TIN-F',
            'taxable_activity_no' => 'TA-F',
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
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'f-owner@test.local', 'phone' => '7744001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->staffNoTrade = User::create([
            'name' => 'Staff', 'email' => 'f-staff@test.local', 'phone' => '7744002',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Report Shop', 'phone' => '+9607744001', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active',
            'credit_limit_laar' => 5_000_000, 'credit_balance_laar' => 0,
        ]);
        $this->account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Report Shop',
            'is_active' => true,
            'missing_policy' => TradeAccount::MISSING_CHARGE,
        ]);

        $cat = Category::create(['name' => 'Trade F', 'slug' => 'trade-f', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Momo set',
            'base_price' => 100, 'cost' => 40, 'sku' => 'MOMO-F',
            'is_active' => true, 'is_available' => true,
            'track_stock' => true, 'availability_type' => 'stock_based',
            'stock_quantity' => 500, 'wholesale_price_laar' => 8000,
        ]);
    }

    private function retailOrder(int $totalLaar = 10000): Order
    {
        return Order::create([
            'order_number' => 'R-'.uniqid(),
            'tracking_token' => 't'.uniqid(),
            'type' => 'takeaway',
            'status' => 'completed',
            'subtotal' => $totalLaar / 100,
            'subtotal_laar' => $totalLaar,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => $totalLaar / 100,
            'total_laar' => $totalLaar,
        ]);
    }

    private function tradeInvoiceWithCogs(
        int $qtySold = 7,
        int $qtyWaste = 2,
        int $qtyMissing = 1,
        int $unitPrice = 5000,
        int $unitCost = 2500,
        ?string $issueDate = null,
        ?string $dueDate = null,
    ): Invoice {
        $qtySent = $qtySold + $qtyWaste + $qtyMissing;
        $delivery = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-F-'.uniqid(),
            'status' => TradeDelivery::STATUS_INVOICED,
            'dispatched_at' => now()->subDays(5),
            // Same calendar day as invoice issue so period filters pick up waste + revenue together.
            'reconciled_at' => now(),
            'invoiced_at' => now(),
            'idempotency_key' => 'f-d-'.uniqid(),
        ]);
        $line = TradeDeliveryLine::create([
            'trade_delivery_id' => $delivery->id,
            'item_id' => $this->item->id,
            'qty_sent' => $qtySent,
            'unit_price_laar' => $unitPrice,
            'unit_cost_laar' => $unitCost,
            'qty_sold' => $qtySold,
            'qty_returned_waste' => $qtyWaste,
            'qty_returned_good' => 0,
            'qty_missing' => $qtyMissing,
            'reported_sold_qty' => $qtySold,
        ]);

        $revenueLaar = ($qtySold + $qtyMissing) * $unitPrice;
        $invoice = Invoice::create([
            'invoice_number' => 'TI-F-'.uniqid(),
            'idempotency_key' => 'f-inv-'.uniqid(),
            'type' => 'sale',
            'status' => 'sent',
            'is_tax_invoice' => true,
            'customer_id' => $this->customer->id,
            'trade_account_id' => $this->account->id,
            'subtotal_laar' => (int) round($revenueLaar / 1.08),
            'tax_laar' => $revenueLaar - (int) round($revenueLaar / 1.08),
            'total_laar' => $revenueLaar,
            'amount_paid_laar' => 0,
            'subtotal' => $revenueLaar / 100,
            'tax_amount' => 0,
            'total' => $revenueLaar / 100,
            'issue_date' => $issueDate ?? now()->toDateString(),
            'due_date' => $dueDate ?? now()->addDays(14)->toDateString(),
            'notes' => 'Wholesale consignment — charged to customer credit account.',
        ]);

        if ($qtySold > 0) {
            TradeInvoiceAllocation::create([
                'invoice_id' => $invoice->id,
                'trade_delivery_line_id' => $line->id,
                'qty_invoiced' => $qtySold,
                'amount_laar' => $qtySold * $unitPrice,
                'line_kind' => TradeInvoiceAllocation::KIND_SOLD,
            ]);
        }
        if ($qtyMissing > 0) {
            TradeInvoiceAllocation::create([
                'invoice_id' => $invoice->id,
                'trade_delivery_line_id' => $line->id,
                'qty_invoiced' => $qtyMissing,
                'amount_laar' => $qtyMissing * $unitPrice,
                'line_kind' => TradeInvoiceAllocation::KIND_MISSING,
            ]);
        }

        if ($qtyWaste > 0) {
            WasteLog::create([
                'item_id' => $this->item->id,
                'quantity' => $qtyWaste,
                'cost_estimate' => ($qtyWaste * $unitCost) / 100,
                'reason' => 'spoilage',
                'user_id' => $this->owner->id,
            ]);
        }

        $this->customer->update(['credit_balance_laar' => $revenueLaar]);

        return $invoice;
    }

    #[Test]
    public function without_wholesale_existing_report_numbers_are_unchanged(): void
    {
        $this->retailOrder(10000);
        $from = now()->startOfDay();
        $to = now()->endOfDay();

        $summary = app(ReportsService::class)->salesSummary($from, $to);
        $this->assertSame(1, $summary['totals']['orders_count']);
        $this->assertEqualsWithDelta(100.0, (float) $summary['totals']['total'], 0.001);
        $this->assertArrayHasKey('wholesale', $summary);
        $this->assertSame(0, $summary['wholesale']['revenue_laar']);

        Sanctum::actingAs($this->owner, ['staff']);
        $pnl = $this->getJson('/api/reports/finance/profit-and-loss?from='.$from->toDateString().'&to='.$to->toDateString())
            ->assertOk()
            ->json();
        $this->assertEqualsWithDelta(100.0, (float) $pnl['revenue']['gross'], 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $pnl['revenue']['wholesale'], 0.001);
        $this->assertEqualsWithDelta((float) $pnl['revenue']['net'], (float) $pnl['revenue']['combined_net'], 0.001);

        $daily = $this->getJson('/api/reports/finance/daily-summary?date='.$from->toDateString())
            ->assertOk()
            ->json();
        $this->assertEqualsWithDelta(100.0, (float) $daily['revenue'], 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $daily['wholesale_revenue'], 0.001);
    }

    #[Test]
    public function trade_invoice_appears_once_under_wholesale_not_retail(): void
    {
        $this->retailOrder(10000);
        $invoice = $this->tradeInvoiceWithCogs(7, 2, 1, 5000, 2500);
        $expectedWholesale = (int) $invoice->total_laar;

        $summary = app(ReportsService::class)->salesSummary(now()->startOfDay(), now()->endOfDay());
        $this->assertEqualsWithDelta(100.0, (float) $summary['totals']['total'], 0.001);
        $this->assertSame($expectedWholesale, $summary['wholesale']['revenue_laar']);
        $this->assertSame(1, $summary['wholesale']['invoices_count']);

        Sanctum::actingAs($this->owner, ['staff']);
        $pnl = $this->getJson('/api/reports/finance/profit-and-loss?from='.now()->toDateString().'&to='.now()->toDateString())
            ->assertOk()->json();
        $this->assertEqualsWithDelta(100.0, (float) $pnl['revenue']['gross'], 0.001);
        $this->assertEqualsWithDelta($expectedWholesale / 100, (float) $pnl['revenue']['wholesale'], 0.001);

        $daily = $this->getJson('/api/reports/finance/daily-summary?date='.now()->toDateString())
            ->assertOk()->json();
        $this->assertEqualsWithDelta(100.0, (float) $daily['revenue'], 0.001);
        $this->assertEqualsWithDelta($expectedWholesale / 100, (float) $daily['wholesale_revenue'], 0.001);
    }

    #[Test]
    public function part_paid_trade_invoice_is_not_double_counted(): void
    {
        $invoice = $this->tradeInvoiceWithCogs(8, 0, 0, 5000, 2500);
        Payment::create([
            'idempotency_key' => 'f-part-'.uniqid(),
            'order_id' => null,
            'invoice_id' => $invoice->id,
            'method' => 'cash',
            'amount' => 200,
            'amount_laar' => 20000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);
        $invoice->update(['amount_paid_laar' => 20000, 'status' => 'sent']);

        $summary = app(ReportsService::class)->salesSummary(now()->startOfDay(), now()->endOfDay());
        // Invoice basis: full invoice once — not invoice + payment.
        $this->assertSame((int) $invoice->total_laar, $summary['wholesale']['revenue_laar']);
        $this->assertSame(1, $summary['wholesale']['invoices_count']);
    }

    #[Test]
    public function wholesale_cogs_uses_stamped_unit_cost_not_current_lookup(): void
    {
        $this->item->update(['cost' => 99.00]); // must be ignored
        $this->tradeInvoiceWithCogs(4, 0, 0, 5000, 2500);
        $summary = app(ReportsService::class)->salesSummary(now()->startOfDay(), now()->endOfDay());
        $this->assertSame(4 * 2500, $summary['wholesale']['cogs_laar']);
    }

    #[Test]
    public function wholesale_waste_is_cost_never_revenue(): void
    {
        $this->tradeInvoiceWithCogs(7, 3, 0, 5000, 2500);
        Sanctum::actingAs($this->owner, ['staff']);
        $pnl = $this->getJson('/api/reports/finance/profit-and-loss?from='.now()->toDateString().'&to='.now()->toDateString())
            ->assertOk()->json();

        $this->assertGreaterThan(0, (float) $pnl['wholesale_waste_cost']);
        $this->assertEqualsWithDelta(3 * 25.0, (float) $pnl['wholesale_waste_cost'], 0.001);
        // Revenue is sold+missing only (7*50), not reduced by waste.
        $this->assertEqualsWithDelta(350.0, (float) $pnl['revenue']['wholesale'], 0.001);
        $json = strtolower(json_encode($pnl));
        $this->assertStringNotContainsString('waste_revenue', $json);
    }

    #[Test]
    public function sell_through_arithmetic_and_worst_first(): void
    {
        // Shop with 10 sent: 5 sold, 2 good return, 2 waste, 1 missing → 50%
        $d = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-ST-1',
            'status' => TradeDelivery::STATUS_RECONCILED,
            'dispatched_at' => now()->subDay(),
            'reconciled_at' => now(),
            'idempotency_key' => 'st-1',
        ]);
        TradeDeliveryLine::create([
            'trade_delivery_id' => $d->id,
            'item_id' => $this->item->id,
            'qty_sent' => 10,
            'unit_price_laar' => 5000,
            'unit_cost_laar' => 2500,
            'qty_sold' => 5,
            'qty_returned_good' => 2,
            'qty_returned_waste' => 2,
            'qty_missing' => 1,
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $rows = $this->getJson('/api/admin/trade-reports/sell-through?from='.now()->subDay()->toDateString().'&to='.now()->toDateString())
            ->assertOk()
            ->json('rows');
        $this->assertCount(1, $rows);
        $this->assertSame(10, $rows[0]['qty_sent']);
        $this->assertSame(5, $rows[0]['qty_sold']);
        $this->assertSame(2, $rows[0]['qty_returned_good']);
        $this->assertSame(2, $rows[0]['qty_wasted']);
        $this->assertSame(1, $rows[0]['qty_missing']);
        $this->assertEqualsWithDelta(50.0, (float) $rows[0]['sell_through_pct'], 0.01);
    }

    #[Test]
    public function suggested_quantity_needs_three_deliveries(): void
    {
        foreach ([3, 5] as $i => $sold) {
            $d = TradeDelivery::create([
                'trade_account_id' => $this->account->id,
                'delivery_number' => 'TD-SQ-'.$i,
                'status' => TradeDelivery::STATUS_RECONCILED,
                'dispatched_at' => now()->subDays(10 - $i),
                'reconciled_at' => now()->subDays(9 - $i),
                'idempotency_key' => 'sq-'.$i,
            ]);
            TradeDeliveryLine::create([
                'trade_delivery_id' => $d->id,
                'item_id' => $this->item->id,
                'qty_sent' => 10,
                'unit_price_laar' => 5000,
                'unit_cost_laar' => 2500,
                'qty_sold' => $sold,
            ]);
        }

        $rows = app(TradeAnalyticsService::class)->suggestedQuantities();
        $this->assertSame('not_enough_history', $rows[0]['status']);
        $this->assertNull($rows[0]['suggested_qty']);
        $this->assertStringContainsString('Not enough history', $rows[0]['message']);

        $d = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-SQ-2',
            'status' => TradeDelivery::STATUS_RECONCILED,
            'dispatched_at' => now()->subDays(2),
            'reconciled_at' => now()->subDay(),
            'idempotency_key' => 'sq-2',
        ]);
        TradeDeliveryLine::create([
            'trade_delivery_id' => $d->id,
            'item_id' => $this->item->id,
            'qty_sent' => 10,
            'unit_price_laar' => 5000,
            'unit_cost_laar' => 2500,
            'qty_sold' => 7,
        ]);

        $rows = app(TradeAnalyticsService::class)->suggestedQuantities();
        $this->assertSame('ok', $rows[0]['status']);
        // (3+5+7)/3 = 5
        $this->assertSame(5, $rows[0]['suggested_qty']);
        $this->assertStringContainsString('3 reconciled', $rows[0]['message']);
    }

    #[Test]
    public function ageing_buckets_respect_exact_30_and_60_day_boundaries(): void
    {
        $asOf = now()->startOfDay();
        foreach ([
            ['due' => $asOf->copy()->addDay(), 'bucket' => 'current_laar', 'amt' => 10000],
            ['due' => $asOf->copy()->subDays(30), 'bucket' => 'days_1_30_laar', 'amt' => 20000],
            ['due' => $asOf->copy()->subDays(60), 'bucket' => 'days_31_60_laar', 'amt' => 30000],
            ['due' => $asOf->copy()->subDays(61), 'bucket' => 'days_60_plus_laar', 'amt' => 40000],
        ] as $i => $case) {
            Invoice::create([
                'invoice_number' => 'TI-AGE-'.$i,
                'idempotency_key' => 'age-'.$i,
                'type' => 'sale',
                'status' => 'sent',
                'is_tax_invoice' => true,
                'customer_id' => $this->customer->id,
                'trade_account_id' => $this->account->id,
                'subtotal_laar' => $case['amt'],
                'tax_laar' => 0,
                'total_laar' => $case['amt'],
                'amount_paid_laar' => 0,
                'subtotal' => $case['amt'] / 100,
                'tax_amount' => 0,
                'total' => $case['amt'] / 100,
                'issue_date' => $asOf->copy()->subDays(90)->toDateString(),
                'due_date' => $case['due']->toDateString(),
            ]);
        }
        $this->customer->update(['credit_balance_laar' => 100000]);

        $rows = app(TradeAnalyticsService::class)->ageingReceivables($asOf);
        $row = collect($rows)->firstWhere('trade_account_id', $this->account->id);
        $this->assertNotNull($row);
        $this->assertSame(10000, $row['current_laar']);
        $this->assertSame(20000, $row['days_1_30_laar']);
        $this->assertSame(30000, $row['days_31_60_laar']);
        $this->assertSame(40000, $row['days_60_plus_laar']);
    }

    #[Test]
    public function margin_per_shop_matches_hand_worked_example(): void
    {
        // Revenue 8*50 = 400; COGS 8*25 = 200; waste 2*25 = 50; margin = 150
        $this->tradeInvoiceWithCogs(8, 2, 0, 5000, 2500);
        $rows = app(TradeAnalyticsService::class)->marginsByShop(now()->startOfDay(), now()->endOfDay());
        $row = collect($rows)->firstWhere('trade_account_id', $this->account->id);
        $this->assertSame(40000, $row['revenue_laar']);
        $this->assertSame(20000, $row['cogs_laar']);
        $this->assertSame(5000, $row['waste_cost_laar']);
        $this->assertSame(15000, $row['margin_laar']);
    }

    #[Test]
    public function unreconciled_and_mismatch_lists_are_exact(): void
    {
        $old = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-OLD',
            'status' => TradeDelivery::STATUS_DISPATCHED,
            'dispatched_at' => now()->subDays(5),
            'idempotency_key' => 'old-1',
        ]);
        $fresh = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-FRESH',
            'status' => TradeDelivery::STATUS_DISPATCHED,
            'dispatched_at' => now()->subDay(),
            'idempotency_key' => 'fresh-1',
        ]);
        $mismatch = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-MM',
            'status' => TradeDelivery::STATUS_RECONCILED,
            'dispatched_at' => now()->subDays(4),
            'reconciled_at' => now()->subDay(),
            'has_mismatch' => true,
            'idempotency_key' => 'mm-1',
        ]);
        $resolved = TradeDelivery::create([
            'trade_account_id' => $this->account->id,
            'delivery_number' => 'TD-RES',
            'status' => TradeDelivery::STATUS_RECONCILED,
            'dispatched_at' => now()->subDays(4),
            'reconciled_at' => now()->subDay(),
            'has_mismatch' => true,
            'mismatch_resolved_at' => now(),
            'idempotency_key' => 'res-1',
        ]);

        $lists = app(TradeAnalyticsService::class)->leakLists(3);
        $unIds = collect($lists['unreconciled'])->pluck('id')->all();
        $mmIds = collect($lists['mismatches'])->pluck('id')->all();
        $this->assertContains($old->id, $unIds);
        $this->assertNotContains($fresh->id, $unIds);
        $this->assertContains($mismatch->id, $mmIds);
        $this->assertNotContains($resolved->id, $mmIds);
    }

    #[Test]
    public function query_count_stays_bounded_on_large_dataset(): void
    {
        for ($i = 0; $i < 40; $i++) {
            $d = TradeDelivery::create([
                'trade_account_id' => $this->account->id,
                'delivery_number' => 'TD-Q-'.$i,
                'status' => TradeDelivery::STATUS_RECONCILED,
                'dispatched_at' => now()->subDays(20),
                'reconciled_at' => now()->subDays(10),
                'idempotency_key' => 'q-'.$i,
            ]);
            for ($j = 0; $j < 10; $j++) {
                TradeDeliveryLine::create([
                    'trade_delivery_id' => $d->id,
                    'item_id' => $this->item->id,
                    'qty_sent' => 10,
                    'unit_price_laar' => 5000,
                    'unit_cost_laar' => 2500,
                    'qty_sold' => 6,
                    'qty_returned_waste' => 1,
                    'qty_returned_good' => 3,
                ]);
            }
        }
        $this->assertGreaterThanOrEqual(400, TradeDeliveryLine::count());

        DB::flushQueryLog();
        DB::enableQueryLog();
        app(TradeAnalyticsService::class)->sellThrough(now()->subMonth(), now());
        app(TradeAnalyticsService::class)->marginsByShop(now()->subMonth(), now());
        app(TradeAnalyticsService::class)->wasteCost(now()->subMonth(), now());
        app(TradeAnalyticsService::class)->suggestedQuantities();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThan(25, $count, "Expected bounded queries, got {$count}");
    }

    #[Test]
    public function trade_view_required_for_wholesale_reports(): void
    {
        Sanctum::actingAs($this->staffNoTrade, ['staff']);
        $this->getJson('/api/admin/trade-reports/sell-through')->assertForbidden();
        $this->getJson('/api/admin/trade-reports/ageing')->assertForbidden();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/trade-reports/sell-through')->assertOk();
        $this->getJson('/api/admin/trade-reports/ageing')->assertOk();
        $this->getJson('/api/admin/trade-reports/exceptions')->assertOk();
    }

    #[Test]
    public function sales_breakdown_keeps_retail_items_separate_from_wholesale(): void
    {
        $this->tradeInvoiceWithCogs(5, 0, 0, 5000, 2500);
        $breakdown = app(ReportsService::class)->salesBreakdown(now()->startOfDay(), now()->endOfDay());
        $this->assertTrue(collect($breakdown['items'])->isEmpty() || collect($breakdown['items'])->every(
            fn ($r) => ! isset($r['channel']) || $r['channel'] !== 'wholesale',
        ));
        $this->assertNotEmpty($breakdown['wholesale_items']);
        $this->assertSame('wholesale', $breakdown['wholesale_items'][0]['channel']);
    }
}
