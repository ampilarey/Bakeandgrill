<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\TaxLedgerEntry;
use Illuminate\Support\Facades\DB;

class GstReconciliationService
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
        private readonly GstPeriodService $periods = new GstPeriodService,
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
    ) {}

    /** @return list<array{type: string, message: string, reference?: string}> */
    public function warnings(string $period): array
    {
        $warnings = [];
        $start = $this->periods->periodStartDate($period);
        $end = $this->periods->periodEndDate($period);

        $paidOrders = Order::query()
            ->whereBetween('paid_at', [$start, $end])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->get();

        foreach ($paidOrders as $order) {
            if ($order->tax_laar === null) {
                $warnings[] = [
                    'type' => 'missing_tax_laar',
                    'message' => "Paid order #{$order->order_number} has null tax_laar.",
                    'reference' => 'order:' . $order->id,
                ];
            }

            if ($order->total_laar === null) {
                $warnings[] = [
                    'type' => 'missing_total_laar',
                    'message' => "Paid order #{$order->order_number} has no integer total_laar.",
                    'reference' => 'order:' . $order->id,
                ];
            } else {
                $expected = (int) ($order->subtotal_laar ?? 0)
                    + (int) ($order->tax_laar ?? 0)
                    + (int) ($order->delivery_fee_laar ?? 0)
                    + (int) ($order->packaging_fee_laar ?? 0)
                    + (int) ($order->small_order_fee_laar ?? 0)
                    - (int) ($order->promo_discount_laar ?? 0)
                    - (int) ($order->loyalty_discount_laar ?? 0)
                    - (int) ($order->manual_discount_laar ?? 0);

                if (abs($expected - (int) $order->total_laar) > 1) {
                    $warnings[] = [
                        'type' => 'total_breakdown_mismatch',
                        'message' => "Order #{$order->order_number} total_laar does not match stored breakdown.",
                        'reference' => 'order:' . $order->id,
                    ];
                }
            }

            $posted = TaxLedgerEntry::query()
                ->where('source_type', 'order')
                ->where('source_id', $order->id)
                ->exists();

            if (!$posted && (int) ($order->tax_laar ?? 0) > 0) {
                $warnings[] = [
                    'type' => 'unposted_order',
                    'message' => "Paid order #{$order->order_number} has tax but no ledger entry.",
                    'reference' => 'order:' . $order->id,
                ];
            }
        }

        $defaultRate = $this->settings->defaultTaxRatePercent();
        Item::query()
            ->where('tax_code', 'standard_8')
            ->where('tax_rate', '!=', $defaultRate)
            ->limit(20)
            ->get(['id', 'name', 'tax_rate'])
            ->each(function (Item $item) use (&$warnings, $defaultRate) {
                $warnings[] = [
                    'type' => 'item_rate_drift',
                    'message' => "Item \"{$item->name}\" tax_rate ({$item->tax_rate}%) differs from GST setting ({$defaultRate}%).",
                    'reference' => 'item:' . $item->id,
                ];
            });

        Purchase::query()
            ->where('is_input_tax_claimable', true)
            ->whereBetween('purchase_date', [$start->toDateString(), $end->toDateString()])
            ->where(function ($q) {
                $q->whereNull('supplier_tin')
                    ->orWhereNull('supplier_invoice_no')
                    ->orWhereNull('supplier_invoice_date');
            })
            ->limit(20)
            ->get(['id', 'purchase_number'])
            ->each(function (Purchase $p) use (&$warnings) {
                $warnings[] = [
                    'type' => 'purchase_claim_missing_docs',
                    'message' => "Purchase {$p->purchase_number} claims input GST but supplier TIN/invoice details are incomplete.",
                    'reference' => 'purchase:' . $p->id,
                ];
            });

        Invoice::query()
            ->where('is_tax_invoice', true)
            ->whereBetween('issue_date', [$start->toDateString(), $end->toDateString()])
            ->where(function ($q) {
                $q->whereNull('customer_tin')->orWhere('customer_tin', '');
            })
            ->limit(20)
            ->get(['id', 'invoice_number'])
            ->each(function (Invoice $inv) use (&$warnings) {
                $warnings[] = [
                    'type' => 'tax_invoice_missing_tin',
                    'message' => "Tax invoice {$inv->invoice_number} is missing customer TIN.",
                    'reference' => 'invoice:' . $inv->id,
                ];
            });

        if ($this->periods->isLocked($period)) {
            $recentEdits = TaxLedgerEntry::query()
                ->where('period_key', $period)
                ->where('updated_at', '>', now()->subDay())
                ->count();

            if ($recentEdits > 0) {
                $warnings[] = [
                    'type' => 'locked_period_edits',
                    'message' => "Locked period {$period} has recent ledger edits.",
                ];
            }
        }

        $ledgerSales = TaxLedgerEntry::query()
            ->where('period_key', $period)
            ->where('direction', 'output')
            ->sum('taxable_value_laar');

        $orderSales = Order::query()
            ->whereBetween('paid_at', [$start, $end])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->sum(DB::raw('COALESCE(subtotal_laar, ROUND(subtotal * 100))'));

        if ($ledgerSales > 0 && abs($ledgerSales - (int) $orderSales) > 100) {
            $warnings[] = [
                'type' => 'sales_report_divergence',
                'message' => 'Output ledger taxable value differs from paid order subtotals for the period.',
            ];
        }

        return $warnings;
    }
}
