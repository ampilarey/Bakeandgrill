<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Gst\Services\GstReportService;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Credit notes and refunds must reduce output tax exactly once.
 *
 * `sumOutput()` sums `direction IN (output, adjustment)`, so an adjustment is
 * already inside `output_tax_before_adjustments_laar`. Adding the negative
 * adjustments to it a second time subtracts every credit note and refund
 * twice, which under-states output tax — money owed to MIRA that the return
 * does not declare.
 */
class GstCreditNoteDoubleCountTest extends TestCase
{
    use RefreshDatabase;

    private function entry(array $attrs): TaxLedgerEntry
    {
        return TaxLedgerEntry::create(array_merge([
            'period_key' => '2026-08',
            'source_type' => 'order',
            'source_id' => 1,
            'direction' => 'output',
            'tax_code' => 'standard_8',
            'document_no' => 'DOC-1',
            'document_date' => '2026-08-10',
            'taxable_value_laar' => 0,
            'tax_laar' => 0,
            'total_laar' => 0,
            'rate_bp' => 800,
            'is_tax_invoice' => true,
            'is_claimable' => false,
        ], $attrs));
    }

    public function test_a_fully_credited_sale_nets_to_zero_output_tax(): void
    {
        // One MVR 100 sale, then a credit note reversing all of it. The period
        // owes nothing. Counted twice, it reports owing minus the tax.
        $this->entry([
            'source_id' => 1,
            'direction' => 'output',
            'taxable_value_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
        ]);
        $this->entry([
            'source_id' => 2,
            'source_type' => 'credit_note',
            'direction' => 'adjustment',
            'document_no' => 'CN-1',
            'taxable_value_laar' => -10000,
            'tax_laar' => -800,
            'total_laar' => -10800,
        ]);

        $summary = app(GstReportService::class)->summary('2026-08');

        $this->assertSame(0, (int) $summary['net_output_tax_laar']);
    }

    public function test_a_partial_refund_reduces_output_tax_by_its_own_value_only(): void
    {
        // MVR 100 sale, MVR 25 refunded. Output tax 800 − 200 = 600.
        $this->entry([
            'source_id' => 1,
            'direction' => 'output',
            'taxable_value_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
        ]);
        $this->entry([
            'source_id' => 2,
            'source_type' => 'refund',
            'direction' => 'adjustment',
            'document_no' => 'REF-1',
            'taxable_value_laar' => -2500,
            'tax_laar' => -200,
            'total_laar' => -2700,
        ]);

        $summary = app(GstReportService::class)->summary('2026-08');

        $this->assertSame(600, (int) $summary['net_output_tax_laar']);
    }

    public function test_a_positive_adjustment_still_raises_output_tax(): void
    {
        // A reclassified invoice moved into an open period posts a POSITIVE
        // adjustment (GstLedgerPoster, reclassify path), as does a manual
        // adjustment correcting an under-declaration. Those must count.
        $this->entry([
            'source_id' => 1,
            'direction' => 'output',
            'taxable_value_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
        ]);
        $this->entry([
            'source_id' => 2,
            'source_type' => 'manual_adjustment',
            'direction' => 'adjustment',
            'document_no' => 'ADJ-1',
            'taxable_value_laar' => 5000,
            'tax_laar' => 400,
            'total_laar' => 5400,
        ]);

        $summary = app(GstReportService::class)->summary('2026-08');

        $this->assertSame(1200, (int) $summary['net_output_tax_laar']);
    }

    public function test_the_declared_adjustment_figure_matches_what_was_applied(): void
    {
        // The return shows both numbers. If the adjustments line says −800 but
        // the net was moved by −1600, the two do not reconcile and whoever
        // files it cannot tell which is right.
        $this->entry([
            'source_id' => 1,
            'direction' => 'output',
            'taxable_value_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
        ]);
        $this->entry([
            'source_id' => 2,
            'source_type' => 'credit_note',
            'direction' => 'adjustment',
            'document_no' => 'CN-1',
            'taxable_value_laar' => -2500,
            'tax_laar' => -200,
            'total_laar' => -2700,
        ]);

        $summary = app(GstReportService::class)->summary('2026-08');

        $before = (int) $summary['output_tax_before_adjustments_laar'];
        $adjustments = (int) $summary['credit_note_refund_adjustments_laar'];

        // "Before adjustments" must mean before them — it used to be read off
        // a figure that already had them subtracted.
        $this->assertSame(800, $before);
        $this->assertSame(-200, $adjustments);
        $this->assertSame(
            $before + $adjustments,
            (int) $summary['net_output_tax_laar'],
            'before + adjustments must equal net, or the return does not add up',
        );
    }
}
