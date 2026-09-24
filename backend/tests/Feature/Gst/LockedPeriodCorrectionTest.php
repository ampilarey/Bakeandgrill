<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Gst\Services\GstReportService;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * GST audit, 2026-09-26: a filed (locked) period never changes.
 *
 * A second delivery on a purchase, or any other re-post, used to rewrite the
 * filed row and move it into the next open period. The next return then
 * claimed the whole purchase again, and the filed return no longer matched
 * the ledger. Now the filed row stays as filed and only the difference is
 * posted, as a correction in the next open period.
 */
class LockedPeriodCorrectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-10 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function purchase(int $gstLaar, int $netLaar): Purchase
    {
        $purchase = new Purchase;
        $purchase->forceFill([
            'purchase_number' => 'PO-1001',
            'status' => 'received',
            'purchase_date' => '2026-08-20',
            'supplier_invoice_no' => 'SUP-77',
            'supplier_invoice_date' => '2026-08-20',
            'supplier_tin' => '1234567GST501',
            'is_input_tax_claimable' => true,
            'is_tax_invoice_received' => true,
            'revenue_or_capital' => 'revenue',
            'gst_laar' => $gstLaar,
            'amount_excluding_gst_laar' => $netLaar,
            'total_laar' => $netLaar + $gstLaar,
            'total' => ($netLaar + $gstLaar) / 100,
        ])->save();

        return $purchase;
    }

    private function lock(string $period): void
    {
        app(GstPeriodService::class)->lock($period, $this->makeOwner()->id);
    }

    public function test_a_change_after_filing_posts_only_the_difference_in_the_next_period(): void
    {
        $poster = app(GstLedgerPoster::class);
        $purchase = $this->purchase(800, 10000);
        $filed = $poster->postPurchaseInput($purchase);
        $this->assertSame('2026-08', $filed->period_key);

        $this->lock('2026-08');

        // The rest of the order arrives and the purchase now carries more GST.
        $purchase->forceFill(['gst_laar' => 1200, 'amount_excluding_gst_laar' => 15000, 'total_laar' => 16200])->save();
        $poster->postPurchaseInput($purchase->fresh());

        $filed->refresh();
        $this->assertSame('2026-08', $filed->period_key);
        $this->assertSame(800, (int) $filed->tax_laar);

        $correction = TaxLedgerEntry::where('source_type', 'purchase')->where('source_id', $purchase->id)
            ->where('period_key', '2026-09')->sole();
        $this->assertSame(400, (int) $correction->tax_laar);
        $this->assertSame(5000, (int) $correction->taxable_value_laar);
        $this->assertSame('SUP-77 (correction 2026-09)', $correction->document_no);
        $this->assertSame($filed->id, $correction->metadata['correction_of']);

        // Posting the same figures again changes nothing.
        $poster->postPurchaseInput($purchase->fresh());
        $this->assertSame(2, TaxLedgerEntry::where('source_type', 'purchase')->count());
        $this->assertSame(400, (int) $correction->fresh()->tax_laar);

        // Across both returns the purchase is claimed once, in full.
        $reports = app(GstReportService::class);
        $this->assertSame(800, (int) $reports->summary('2026-08')['claimable_input_revenue_laar']);
        $this->assertSame(400, (int) $reports->summary('2026-09')['claimable_input_revenue_laar']);
    }

    public function test_a_re_post_with_the_same_figures_leaves_the_filed_row_where_it_is(): void
    {
        $poster = app(GstLedgerPoster::class);
        $purchase = $this->purchase(800, 10000);
        $filed = $poster->postPurchaseInput($purchase);
        $this->lock('2026-08');

        // A second receive against the same purchase re-posts the whole document.
        $poster->postPurchaseInput($purchase->fresh());

        $this->assertSame('2026-08', $filed->fresh()->period_key);
        $this->assertSame(1, TaxLedgerEntry::count());
        $this->assertSame(0, (int) TaxLedgerEntry::where('period_key', '2026-09')->sum('tax_laar'));
    }

    public function test_a_correction_reverted_before_filing_is_removed(): void
    {
        $poster = app(GstLedgerPoster::class);
        $purchase = $this->purchase(800, 10000);
        $poster->postPurchaseInput($purchase);
        $this->lock('2026-08');

        $purchase->forceFill(['gst_laar' => 1200, 'amount_excluding_gst_laar' => 15000, 'total_laar' => 16200])->save();
        $poster->postPurchaseInput($purchase->fresh());
        $this->assertSame(2, TaxLedgerEntry::count());

        $purchase->forceFill(['gst_laar' => 800, 'amount_excluding_gst_laar' => 10000, 'total_laar' => 10800])->save();
        $poster->postPurchaseInput($purchase->fresh());
        $this->assertSame(1, TaxLedgerEntry::count());
    }

    public function test_a_correction_in_a_period_since_filed_is_kept_and_a_new_one_carries_the_rest(): void
    {
        $poster = app(GstLedgerPoster::class);
        $purchase = $this->purchase(800, 10000);
        $poster->postPurchaseInput($purchase);
        $this->lock('2026-08');

        $purchase->forceFill(['gst_laar' => 1200, 'amount_excluding_gst_laar' => 15000, 'total_laar' => 16200])->save();
        $poster->postPurchaseInput($purchase->fresh());
        $this->lock('2026-09');

        $purchase->forceFill(['gst_laar' => 1000, 'amount_excluding_gst_laar' => 12500, 'total_laar' => 13500])->save();
        $poster->postPurchaseInput($purchase->fresh());

        $this->assertSame(400, (int) TaxLedgerEntry::where('period_key', '2026-09')->value('tax_laar'));
        $this->assertSame(-200, (int) TaxLedgerEntry::where('period_key', '2026-10')->value('tax_laar'));
        $this->assertSame(1000, (int) TaxLedgerEntry::sum('tax_laar'));
    }

    public function test_undoing_a_receipt_after_filing_reverses_the_claim_in_the_next_period(): void
    {
        $poster = app(GstLedgerPoster::class);
        $purchase = $this->purchase(800, 10000);
        $filed = $poster->postPurchaseInput($purchase);
        $this->lock('2026-08');

        $this->assertSame(['2026-09'], $poster->withdrawPurchaseInput($purchase));

        $this->assertSame(800, (int) $filed->fresh()->tax_laar);
        $this->assertSame(-800, (int) TaxLedgerEntry::where('period_key', '2026-09')->value('tax_laar'));
    }

    public function test_undoing_a_receipt_in_an_open_period_removes_the_claim(): void
    {
        $poster = app(GstLedgerPoster::class);
        $poster->postPurchaseInput($purchase = $this->purchase(800, 10000));

        $this->assertSame([], $poster->withdrawPurchaseInput($purchase));
        $this->assertSame(0, TaxLedgerEntry::count());
    }

    public function test_a_tax_invoice_for_an_order_in_a_filed_period_does_not_declare_its_tax_again(): void
    {
        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'paid_at' => '2026-08-15 12:00:00',
            'subtotal_laar' => 10000, 'tax_laar' => 800, 'total_laar' => 10800,
            'subtotal' => 100, 'tax_amount' => 8, 'total' => 108,
            'tax_rate_bp' => 800,
        ]);
        $poster = app(GstLedgerPoster::class);
        $poster->postOrderOnPayment($order);
        $this->lock('2026-08');

        $invoice = Invoice::create([
            'invoice_number' => 'BG-TI-2026-00009',
            'type' => 'sale',
            'status' => 'paid',
            'order_id' => $order->id,
            'is_tax_invoice' => true,
            'customer_tin' => 'TIN123456',
            'issue_date' => '2026-09-05',
            'subtotal_laar' => 10000, 'tax_laar' => 800, 'total_laar' => 10800,
            'subtotal' => 100, 'tax_amount' => 8, 'total' => 108,
        ]);
        $row = $poster->postTaxInvoice($invoice);

        $this->assertSame('2026-09', $row->period_key);
        $this->assertSame(0, (int) $row->tax_laar);
        $this->assertSame(800, $row->metadata['invoice_tax_laar']);
        $this->assertSame(800, (int) app(GstReportService::class)->summary('2026-08')['net_output_tax_laar']);
        $this->assertSame(0, (int) app(GstReportService::class)->summary('2026-09')['net_output_tax_laar']);
    }

    public function test_a_late_payment_refund_is_not_posted_as_a_gst_reversal(): void
    {
        $order = Order::factory()->create([
            'status' => 'cancelled',
            'subtotal_laar' => 10000, 'tax_laar' => 800, 'total_laar' => 10800,
            'subtotal' => 100, 'tax_amount' => 8, 'total' => 108,
            'tax_rate_bp' => 800,
        ]);
        $refund = new Refund;
        $refund->forceFill([
            'order_id' => $order->id,
            'amount' => 108,
            'status' => 'approved',
            'initiated_by' => 'system',
            'reason' => 'Payment #1 arrived after the order was cancelled',
        ])->save();

        $this->assertNull(app(GstLedgerPoster::class)->postRefund($refund));
        $this->assertSame(0, TaxLedgerEntry::count());
    }
}
