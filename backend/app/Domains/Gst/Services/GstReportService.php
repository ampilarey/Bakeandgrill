<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Gst\Enums\GstTaxCode;
use App\Domains\Gst\Enums\LedgerDirection;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Order;
use App\Models\TaxLedgerEntry;
use Illuminate\Support\Collection;

class GstReportService
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
        private readonly GstPeriodService $periods = new GstPeriodService,
        private readonly GstReconciliationService $reconciliation = new GstReconciliationService,
    ) {}

    public function summary(string $period): array
    {
        $settings = $this->settings->get();
        $entries = $this->entriesForPeriod($period);

        $outputStandard = $this->sumOutput($entries, GstTaxCode::Standard8->value);
        $outputZero = $this->sumOutput($entries, GstTaxCode::ZeroRated->value);
        $outputExempt = $this->sumOutput($entries, GstTaxCode::Exempt->value);
        $outputOut = $this->sumOutput($entries, GstTaxCode::OutOfScope->value);

        $adjustments = $entries->where('direction', LedgerDirection::Adjustment->value);
        $creditNoteTax = $adjustments->where('tax_laar', '<', 0)->sum('tax_laar');

        $inputClaimableRevenue = $entries
            ->where('direction', LedgerDirection::Input->value)
            ->where('is_claimable', true)
            ->where('revenue_or_capital', 'revenue')
            ->sum('tax_laar');

        $inputClaimableCapital = $entries
            ->where('direction', LedgerDirection::Input->value)
            ->where('is_claimable', true)
            ->where('revenue_or_capital', 'capital')
            ->sum('tax_laar');

        $inputBlocked = $entries
            ->where('direction', LedgerDirection::Input->value)
            ->where('is_claimable', false)
            ->sum('tax_laar');

        $carryForward = $this->periods->carryForwardInputLaar($period);
        $outputTaxBeforeAdj = $outputStandard['tax_laar'];
        $netOutputTax = $outputTaxBeforeAdj + $creditNoteTax;
        $claimableInput = $inputClaimableRevenue + $inputClaimableCapital;
        $netPayable = $netOutputTax - $claimableInput - $carryForward;
        $excessCarryForward = $netPayable < 0 ? abs($netPayable) : 0;
        if ($netPayable < 0) {
            $netPayable = 0;
        }

        $counts = $this->countsForPeriod($period);

        return [
            'period' => $period,
            'business_tin' => $settings->seller_tin,
            'taxable_activity_no' => $settings->taxable_activity_no,
            'opening_carry_forward_input_laar' => $carryForward,
            'standard_rated_sales_ex_gst_laar' => $outputStandard['taxable_laar'],
            'gst_on_standard_sales_laar' => $outputStandard['tax_laar'],
            'zero_rated_sales_laar' => $outputZero['taxable_laar'],
            'exempt_sales_laar' => $outputExempt['taxable_laar'],
            'out_of_scope_sales_laar' => $outputOut['taxable_laar'],
            'output_tax_before_adjustments_laar' => $outputTaxBeforeAdj,
            'credit_note_refund_adjustments_laar' => $creditNoteTax,
            'net_output_tax_laar' => $netOutputTax,
            'claimable_input_revenue_laar' => $inputClaimableRevenue,
            'claimable_input_capital_laar' => $inputClaimableCapital,
            'blocked_input_tax_laar' => $inputBlocked,
            'net_gst_payable_laar' => $netPayable,
            'excess_input_carry_forward_laar' => $excessCarryForward,
            'counts' => $counts,
            'warnings' => $this->reconciliation->warnings($period),
            'locked' => $this->periods->isLocked($period),
        ];
    }

    public function outputStatement(string $period): array
    {
        $settings = $this->settings->get();
        $activityNo = $settings->taxable_activity_no;

        $taxInvoices = TaxLedgerEntry::query()
            ->where('period_key', $period)
            ->where('direction', LedgerDirection::Output->value)
            ->where('is_tax_invoice', true)
            ->whereNotNull('customer_tin')
            ->where('customer_tin', '!=', '')
            ->orderBy('document_date')
            ->get()
            ->map(fn (TaxLedgerEntry $e) => [
                'customer_tin' => $e->customer_tin,
                'customer_name' => $e->customer?->name,
                'invoice_no' => $e->document_no,
                'invoice_date' => $e->document_date?->toDateString(),
                'standard_8_laar' => $e->tax_code === GstTaxCode::Standard8->value ? $e->taxable_value_laar : 0,
                'zero_rated_laar' => $e->tax_code === GstTaxCode::ZeroRated->value ? $e->taxable_value_laar : 0,
                'exempt_laar' => $e->tax_code === GstTaxCode::Exempt->value ? $e->taxable_value_laar : 0,
                'out_of_scope_laar' => $e->tax_code === GstTaxCode::OutOfScope->value ? $e->taxable_value_laar : 0,
                'taxable_activity_no' => $e->taxable_activity_no ?? $activityNo,
            ]);

        $invoiceIds = TaxLedgerEntry::query()
            ->where('period_key', $period)
            ->where('is_tax_invoice', true)
            ->whereNotNull('customer_tin')
            ->pluck('source_id');

        $other = TaxLedgerEntry::query()
            ->where('period_key', $period)
            ->where('direction', LedgerDirection::Output->value)
            ->where('is_tax_invoice', false)
            ->get();

        $otherAgg = [
            'taxable_activity_no' => $activityNo,
            'standard_8_laar' => $other->where('tax_code', GstTaxCode::Standard8->value)->sum('taxable_value_laar'),
            'zero_rated_laar' => $other->where('tax_code', GstTaxCode::ZeroRated->value)->sum('taxable_value_laar'),
            'exempt_laar' => $other->where('tax_code', GstTaxCode::Exempt->value)->sum('taxable_value_laar'),
            'out_of_scope_laar' => $other->where('tax_code', GstTaxCode::OutOfScope->value)->sum('taxable_value_laar'),
        ];

        return [
            'period' => $period,
            'tax_invoices' => $taxInvoices,
            'other_transactions' => [$otherAgg],
            'meta' => [
                'tax_invoice_count' => $taxInvoices->count(),
                'excluded_invoice_source_ids' => $invoiceIds,
            ],
        ];
    }

    public function inputStatement(string $period): array
    {
        $settings = $this->settings->get();

        $rows = TaxLedgerEntry::query()
            ->with(['supplier:id,name'])
            ->where('period_key', $period)
            ->where('direction', LedgerDirection::Input->value)
            ->where('is_claimable', true)
            ->where('tax_laar', '>', 0)
            ->orderBy('document_date')
            ->get()
            ->flatMap(function (TaxLedgerEntry $e) use ($settings) {
                $base = [
                    'supplier_tin' => $e->supplier_tin,
                    'supplier_name' => $e->supplier?->name,
                    'supplier_invoice_no' => $e->document_no,
                    'invoice_date' => $e->document_date?->toDateString(),
                    'total_ex_gst_laar' => $e->taxable_value_laar,
                    'gst_6_laar' => 0,
                    'gst_8_laar' => $e->rate_bp === 800 ? $e->tax_laar : 0,
                    'gst_12_laar' => $e->rate_bp === 1200 ? $e->tax_laar : 0,
                    'gst_16_laar' => in_array($e->rate_bp, [1600, 1700], true) ? $e->tax_laar : 0,
                    'taxable_activity_no' => $e->taxable_activity_no ?? $settings->taxable_activity_no,
                ];

                if ($e->revenue_or_capital === 'capital') {
                    return [array_merge($base, ['revenue_or_capital' => 'capital'])];
                }
                if ($e->revenue_or_capital === 'revenue') {
                    return [array_merge($base, ['revenue_or_capital' => 'revenue'])];
                }

                return [array_merge($base, ['revenue_or_capital' => 'revenue'])];
            })
            ->values();

        return [
            'period' => $period,
            'rows' => $rows,
        ];
    }

    public function ledger(string $period, int $page = 1): array
    {
        $paginator = TaxLedgerEntry::query()
            ->where('period_key', $period)
            ->orderByDesc('document_date')
            ->paginate(50, ['*'], 'page', $page);

        return [
            'period' => $period,
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /** Legacy wrapper for GET /reports/finance/tax */
    public function legacyTaxSummary(string $from, string $to): array
    {
        $summary = $this->summary(substr($from, 0, 7));

        return [
            'from' => $from,
            'to' => $to,
            'output_tax' => [
                'taxable_revenue' => $summary['standard_rated_sales_ex_gst_laar'] / 100,
                'tax_collected' => $summary['gst_on_standard_sales_laar'] / 100,
                'by_period' => [[
                    'period' => substr($from, 0, 7),
                    'taxable_amount' => $summary['standard_rated_sales_ex_gst_laar'] / 100,
                    'tax_collected' => $summary['gst_on_standard_sales_laar'] / 100,
                    'transactions' => $summary['counts']['orders'] ?? 0,
                ]],
            ],
            'input_tax' => ($summary['claimable_input_revenue_laar'] + $summary['claimable_input_capital_laar']) / 100,
            'net_tax_payable' => $summary['net_gst_payable_laar'] / 100,
            'total_tax_collected' => $summary['gst_on_standard_sales_laar'] / 100,
            'by_rate' => [[
                'rate_pct' => $this->settings->defaultTaxRatePercent(),
                'net_sales' => $summary['standard_rated_sales_ex_gst_laar'] / 100,
                'tax_amount' => $summary['gst_on_standard_sales_laar'] / 100,
            ]],
        ];
    }

    private function entriesForPeriod(string $period): Collection
    {
        return TaxLedgerEntry::query()->where('period_key', $period)->get();
    }

    /** @return array{taxable_laar: int, tax_laar: int} */
    private function sumOutput(Collection $entries, string $taxCode): array
    {
        $filtered = $entries->whereIn('direction', [
            LedgerDirection::Output->value,
            LedgerDirection::Adjustment->value,
        ])->where('tax_code', $taxCode);

        return [
            'taxable_laar' => (int) $filtered->sum('taxable_value_laar'),
            'tax_laar' => (int) $filtered->sum('tax_laar'),
        ];
    }

    /** @return array<string, int> */
    private function countsForPeriod(string $period): array
    {
        $start = $this->periods->periodStartDate($period);
        $end = $this->periods->periodEndDate($period);

        return [
            'orders' => Order::whereBetween('created_at', [$start, $end])
                ->whereIn('status', ReportMoneySql::SALE_STATUSES)
                ->count(),
            'ledger_output' => TaxLedgerEntry::where('period_key', $period)
                ->where('direction', LedgerDirection::Output->value)->count(),
            'tax_invoices' => TaxLedgerEntry::where('period_key', $period)
                ->where('is_tax_invoice', true)->count(),
            'refunds' => TaxLedgerEntry::where('period_key', $period)
                ->where('source_type', 'refund')->count(),
            'purchases' => TaxLedgerEntry::where('period_key', $period)
                ->where('source_type', 'purchase')->count(),
            'expenses' => TaxLedgerEntry::where('period_key', $period)
                ->where('source_type', 'expense')->count(),
        ];
    }
}
