<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\TaxLedgerEntry;
use Carbon\Carbon;
use Illuminate\Console\Command;

class GstBackfillLedgerCommand extends Command
{
    protected $signature = 'gst:backfill-ledger
                            {--from= : Start date YYYY-MM-DD}
                            {--to= : End date YYYY-MM-DD}
                            {--dry-run : Report only, do not write}';

    protected $description = 'Backfill GST tax ledger entries idempotently from historical records';

    public function handle(GstLedgerPoster $poster): int
    {
        $from = Carbon::parse($this->option('from') ?? now()->subYear()->toDateString())->startOfDay();
        $to = Carbon::parse($this->option('to') ?? now()->toDateString())->endOfDay();
        $dryRun = (bool) $this->option('dry-run');

        $this->info("GST backfill {$from->toDateString()} → {$to->toDateString()}" . ($dryRun ? ' (dry-run)' : ''));

        $stats = ['orders' => 0, 'refunds' => 0, 'invoices' => 0, 'purchases' => 0, 'expenses' => 0, 'skipped' => 0, 'mismatches' => 0];

        Order::query()
            ->whereBetween('paid_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->orderBy('id')
            ->chunkById(100, function ($orders) use ($poster, $dryRun, &$stats) {
                foreach ($orders as $order) {
                    if ($dryRun) {
                        $exists = TaxLedgerEntry::where('source_type', 'order')->where('source_id', $order->id)->exists();
                        if (!$exists && (int) ($order->tax_laar ?? 0) > 0) {
                            $stats['orders']++;
                        } else {
                            $stats['skipped']++;
                        }
                        continue;
                    }
                    $entry = $poster->postOrderOnPayment($order);
                    $entry ? $stats['orders']++ : $stats['skipped']++;
                }
            });

        Refund::query()
            ->whereBetween('updated_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->chunkById(100, function ($refunds) use ($poster, $dryRun, &$stats) {
                foreach ($refunds as $refund) {
                    if ($dryRun) {
                        $exists = TaxLedgerEntry::where('source_type', 'refund')->where('source_id', $refund->id)->exists();
                        $exists ? $stats['skipped']++ : $stats['refunds']++;
                        continue;
                    }
                    $entry = $poster->postRefund($refund);
                    $entry ? $stats['refunds']++ : $stats['skipped']++;
                }
            });

        Invoice::query()
            ->where('is_tax_invoice', true)
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->chunkById(100, function ($invoices) use ($poster, $dryRun, &$stats) {
                foreach ($invoices as $invoice) {
                    if ($dryRun) {
                        $exists = TaxLedgerEntry::where('source_type', 'invoice')->where('source_id', $invoice->id)->exists();
                        $exists ? $stats['skipped']++ : $stats['invoices']++;
                        continue;
                    }
                    $entry = $poster->postTaxInvoice($invoice);
                    $entry ? $stats['invoices']++ : $stats['skipped']++;
                }
            });

        Purchase::query()
            // Anything that took delivery, whatever the status ended up as —
            // a short-closed order claimed input tax on what did arrive.
            ->where(fn ($q) => $q->whereIn('status', ['received', 'partial'])
                ->orWhereHas('items', fn ($i) => $i->where('received_quantity', '>', 0)))
            ->whereBetween('purchase_date', [$from->toDateString(), $to->toDateString()])
            ->chunkById(100, function ($purchases) use ($poster, $dryRun, &$stats) {
                foreach ($purchases as $purchase) {
                    if ($dryRun) {
                        $exists = TaxLedgerEntry::where('source_type', 'purchase')->where('source_id', $purchase->id)->exists();
                        $exists ? $stats['skipped']++ : $stats['purchases']++;
                        continue;
                    }
                    $entry = $poster->postPurchaseInput($purchase);
                    $entry ? $stats['purchases']++ : $stats['skipped']++;
                }
            });

        Expense::query()
            ->where('status', 'approved')
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->chunkById(100, function ($expenses) use ($poster, $dryRun, &$stats) {
                foreach ($expenses as $expense) {
                    if ($dryRun) {
                        $exists = TaxLedgerEntry::where('source_type', 'expense')->where('source_id', $expense->id)->exists();
                        $exists ? $stats['skipped']++ : $stats['expenses']++;
                        continue;
                    }
                    $entry = $poster->postExpenseInput($expense);
                    $entry ? $stats['expenses']++ : $stats['skipped']++;
                }
            });

        $this->table(array_keys($stats), [array_values($stats)]);

        return self::SUCCESS;
    }
}
