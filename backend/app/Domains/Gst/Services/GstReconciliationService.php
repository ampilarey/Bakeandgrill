<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\TaxLedgerEntry;
use Illuminate\Support\Facades\DB;

class GstReconciliationService
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
        private readonly GstPeriodService $periods = new GstPeriodService,
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
    ) {}

    /**
     * Warnings about the catalogue rather than the period's figures. They
     * show on every period until the item is fixed, so they do not hold up a
     * lock (a custom catering line priced at 0% would otherwise ask for a
     * reason every month).
     */
    public const ADVISORY_TYPES = ['item_rate_drift'];

    /**
     * @param list<array{type: string, message: string, reference?: string}> $warnings
     * @return list<array{type: string, message: string, reference?: string}>
     */
    public static function blocking(array $warnings): array
    {
        return array_values(array_filter(
            $warnings,
            fn (array $w) => !in_array($w['type'], self::ADVISORY_TYPES, true),
        ));
    }

    /** @return list<array{type: string, message: string, reference?: string}> */
    public function warnings(string $period): array
    {
        $warnings = [];
        $start = $this->periods->periodStartDate($period);
        $end = $this->periods->periodEndDate($period);

        // A sale refunded in full was still a sale, and its output tax was
        // posted when it was paid: check it like any other.
        $saleStatuses = [...ReportMoneySql::SALE_STATUSES, 'refunded'];

        $paidOrders = Order::query()
            ->whereBetween('paid_at', [$start, $end])
            ->whereIn('status', $saleStatuses)
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

        /*
         * GST audit, 2026-09-26: a refund on a taxed sale gives back GST.
         * With no ledger entry the return declares tax that was handed back.
         * A system refund returns a late payment on a cancelled order and
         * never carried tax, so it is not expected to post.
         */
        Refund::query()
            ->join('orders', 'orders.id', '=', 'refunds.order_id')
            ->whereIn('refunds.status', ['approved', 'processed', 'completed'])
            ->where('refunds.initiated_by', '!=', 'system')
            ->whereRaw('COALESCE(refunds.approved_at, refunds.updated_at) BETWEEN ? AND ?', [$start, $end])
            ->whereRaw(ReportMoneySql::ORDER_TAX_LAAR . ' > 0')
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('tax_ledger_entries as t')
                ->where('t.source_type', 'refund')
                ->whereColumn('t.source_id', 'refunds.id'))
            ->limit(20)
            ->get(['refunds.id', 'orders.order_number'])
            ->each(function ($r) use (&$warnings) {
                $warnings[] = [
                    'type' => 'unposted_refund',
                    'message' => "Refund #{$r->id} on order #{$r->order_number} has no GST entry, so its tax is still declared.",
                    'reference' => 'refund:' . $r->id,
                ];
            });

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
            ->whereIn('status', $saleStatuses)
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
