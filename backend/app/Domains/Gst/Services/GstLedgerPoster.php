<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Domains\Gst\Enums\GstAccountingBasis;
use App\Domains\Gst\Enums\GstTaxCode;
use App\Domains\Gst\Enums\LedgerDirection;
use App\Domains\Gst\Enums\LedgerSourceType;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\TaxLedgerEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class GstLedgerPoster
{
    public function __construct(
        private readonly GstSettingsService $settings = new GstSettingsService,
        private readonly GstPeriodService $periods = new GstPeriodService,
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
    ) {}

    public function shouldPostOrderOnPayment(): bool
    {
        $basis = $this->settings->accountingBasis();

        return $basis === GstAccountingBasis::Payment || $basis === GstAccountingBasis::Hybrid;
    }

    public function shouldPostOnTaxInvoice(): bool
    {
        $basis = $this->settings->accountingBasis();

        return $basis === GstAccountingBasis::Invoice || $basis === GstAccountingBasis::Hybrid;
    }

    public function postOrderOnPayment(Order $order, ?int $userId = null): ?TaxLedgerEntry
    {
        if (!$this->shouldPostOrderOnPayment()) {
            return null;
        }

        if (!in_array($order->payment_status, ['paid', 'partially_paid'], true)
            && !in_array($order->status, ['paid', 'completed', 'delivered', 'partially_refunded'], true)) {
            return null;
        }

        $paymentDate = $order->paid_at ?? $order->updated_at ?? now();
        $date = Carbon::parse($paymentDate);

        return $this->postOrderOutput($order, $date, false, null, $userId);
    }

    public function postTaxInvoice(Invoice $invoice, ?int $userId = null): ?TaxLedgerEntry
    {
        if (!$invoice->is_tax_invoice || !$this->shouldPostOnTaxInvoice()) {
            return null;
        }

        if ($invoice->type !== 'sale') {
            return null;
        }

        $order = $invoice->order;
        if ($order) {
            // Hybrid: reclassify from OtherTransactions to TaxInvoices via adjustment pattern.
            $existing = TaxLedgerEntry::query()
                ->where('source_type', LedgerSourceType::Order->value)
                ->where('source_id', $order->id)
                ->where('direction', LedgerDirection::Output->value)
                ->where('is_tax_invoice', false)
                ->first();

            if ($existing && !$existing->is_tax_invoice) {
                return $this->reclassifyOrderToTaxInvoice($existing, $invoice, $userId);
            }
        }

        $issueDate = Carbon::parse($invoice->issue_date);

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($issueDate, LedgerSourceType::Invoice->value, $invoice->id),
            'source_type' => LedgerSourceType::Invoice->value,
            'source_id' => $invoice->id,
            'direction' => LedgerDirection::Output->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $this->settings->get()->taxable_activity_no,
            'customer_id' => $invoice->customer_id,
            'customer_tin' => $invoice->customer_tin,
            'document_no' => $invoice->invoice_number,
            'document_date' => $issueDate->toDateString(),
            // Taxable base = post-discount (subtotal - discounts), not gross subtotal.
            'taxable_value_laar' => max(0, (int) ($invoice->subtotal_laar ?? round((float) $invoice->subtotal * 100))
                - (int) ($invoice->discount_laar ?? round((float) ($invoice->discount_amount ?? 0) * 100))),
            'tax_laar' => (int) ($invoice->tax_laar ?? round((float) $invoice->tax_amount * 100)),
            'total_laar' => (int) ($invoice->total_laar ?? round((float) $invoice->total * 100)),
            'rate_bp' => (int) ($invoice->tax_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'invoice_basis_date' => $issueDate->toDateString(),
            'is_tax_invoice' => true,
            'is_claimable' => false,
            'created_by' => $userId,
        ]);
    }

    public function postCreditNote(Invoice $creditNote, ?int $userId = null): ?TaxLedgerEntry
    {
        if ($creditNote->type !== 'credit_note') {
            return null;
        }

        $issueDate = Carbon::parse($creditNote->issue_date);
        $taxLaar = (int) ($creditNote->tax_laar ?? round((float) $creditNote->tax_amount * 100));

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($issueDate, LedgerSourceType::CreditNote->value, $creditNote->id),
            'source_type' => LedgerSourceType::CreditNote->value,
            'source_id' => $creditNote->id,
            'direction' => LedgerDirection::Adjustment->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $this->settings->get()->taxable_activity_no,
            'customer_id' => $creditNote->customer_id,
            'customer_tin' => $creditNote->customer_tin,
            'document_no' => $creditNote->invoice_number,
            'document_date' => $issueDate->toDateString(),
            'taxable_value_laar' => -1 * (int) abs($creditNote->subtotal_laar ?? round((float) $creditNote->subtotal * 100)),
            'tax_laar' => -1 * abs($taxLaar),
            'total_laar' => -1 * (int) abs($creditNote->total_laar ?? round((float) $creditNote->total * 100)),
            'rate_bp' => (int) ($creditNote->tax_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'invoice_basis_date' => $issueDate->toDateString(),
            'is_tax_invoice' => true,
            'is_claimable' => false,
            'metadata' => ['credit_note_reason' => $creditNote->credit_note_reason],
            'created_by' => $userId,
        ]);
    }

    public function postRefund(Refund $refund, ?Invoice $creditNote = null, ?int $userId = null): ?TaxLedgerEntry
    {
        if (!in_array($refund->status, ['approved', 'processed', 'completed'], true)) {
            return null;
        }

        $order = $refund->order;
        if (!$order) {
            return null;
        }

        $refundDate = Carbon::parse($refund->processed_at ?? $refund->updated_at ?? now());
        $orderTaxLaar = (int) ($order->tax_laar ?? round((float) $order->tax_amount * 100));
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));

        if ($orderTotalLaar <= 0 || $orderTaxLaar <= 0) {
            return null;
        }

        $refundLaar = (int) ($refund->amount_laar ?? round((float) $refund->amount * 100));
        // Allocate GST against the taxable+tax portion of the order so
        // delivery/packaging/tip fees do not dilute the refund tax share.
        $subtotalLaar = EffectiveDiscount::subtotalLaarFromOrder($order);
        $parts = EffectiveDiscount::partsFromOrder($order);
        $taxableLaar = max(0, $subtotalLaar - EffectiveDiscount::effectiveTotalLaar($subtotalLaar, $parts));
        $taxablePlusTax = max(1, $taxableLaar + $orderTaxLaar);
        $refundTaxLaar = (int) min(
            $orderTaxLaar,
            round($orderTaxLaar * min(1.0, $refundLaar / $taxablePlusTax)),
        );
        $refundTaxableLaar = (int) max(0, $refundLaar - $refundTaxLaar);

        $docNo = $creditNote?->invoice_number ?? ('REF-' . $refund->id);

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($refundDate, LedgerSourceType::Refund->value, $refund->id),
            'source_type' => LedgerSourceType::Refund->value,
            'source_id' => $refund->id,
            'direction' => LedgerDirection::Adjustment->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $this->settings->get()->taxable_activity_no,
            'customer_id' => $order->customer_id,
            'document_no' => $docNo,
            'document_date' => $refundDate->toDateString(),
            'taxable_value_laar' => -1 * abs($refundTaxableLaar),
            'tax_laar' => -1 * abs($refundTaxLaar),
            'total_laar' => -1 * abs($refundLaar),
            'rate_bp' => (int) ($order->tax_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'payment_basis_date' => $refundDate->toDateString(),
            'is_tax_invoice' => false,
            'is_claimable' => false,
            'created_by' => $userId,
        ]);
    }

    public function postPurchaseInput(Purchase $purchase, ?int $userId = null): ?TaxLedgerEntry
    {
        if (!in_array($purchase->status, ['received', 'partial'], true)) {
            return null;
        }

        if (!(bool) $purchase->is_input_tax_claimable) {
            return $this->postNonClaimablePurchase($purchase, $userId);
        }

        $gstLaar = (int) ($purchase->gst_laar ?? 0);
        if ($gstLaar <= 0) {
            return null;
        }

        $invoiceDate = Carbon::parse($purchase->supplier_invoice_date ?? $purchase->purchase_date ?? now());

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($invoiceDate, LedgerSourceType::Purchase->value, $purchase->id),
            'source_type' => LedgerSourceType::Purchase->value,
            'source_id' => $purchase->id,
            'direction' => LedgerDirection::Input->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $purchase->taxable_activity_no ?? $this->settings->get()->taxable_activity_no,
            'supplier_id' => $purchase->supplier_id,
            'supplier_tin' => $purchase->supplier_tin,
            'document_no' => $purchase->supplier_invoice_no ?? $purchase->purchase_number,
            'document_date' => $invoiceDate->toDateString(),
            'taxable_value_laar' => (int) ($purchase->amount_excluding_gst_laar ?? 0),
            'tax_laar' => $gstLaar,
            'total_laar' => (int) ($purchase->total_laar ?? round((float) $purchase->total * 100)),
            'rate_bp' => (int) ($purchase->gst_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'invoice_basis_date' => $invoiceDate->toDateString(),
            'is_tax_invoice' => (bool) $purchase->is_tax_invoice_received,
            'is_claimable' => true,
            'revenue_or_capital' => $purchase->revenue_or_capital,
            'created_by' => $userId,
        ]);
    }

    public function postExpenseInput(Expense $expense, ?int $userId = null): ?TaxLedgerEntry
    {
        if ($expense->status !== 'approved') {
            return null;
        }

        $gstLaar = (int) ($expense->tax_laar ?? 0);

        if (!(bool) $expense->is_input_tax_claimable) {
            if ($gstLaar <= 0) {
                return null;
            }

            return $this->upsertEntry([
                'period_key' => $this->resolvePeriodKey(
                    Carbon::parse($expense->expense_date),
                    LedgerSourceType::Expense->value,
                    $expense->id,
                ),
                'source_type' => LedgerSourceType::Expense->value,
                'source_id' => $expense->id,
                'direction' => LedgerDirection::Input->value,
                'tax_code' => GstTaxCode::Standard8->value,
                'supplier_id' => $expense->supplier_id,
                'supplier_tin' => $expense->supplier_tin,
                'document_no' => $expense->supplier_invoice_no ?? $expense->expense_number,
                'document_date' => Carbon::parse($expense->supplier_invoice_date ?? $expense->expense_date)->toDateString(),
                'taxable_value_laar' => (int) ($expense->amount_excluding_gst_laar ?? 0),
                'tax_laar' => $gstLaar,
                'total_laar' => (int) (($expense->amount_excluding_gst_laar ?? 0) + $gstLaar),
                'rate_bp' => (int) ($expense->gst_rate_bp ?: $this->settings->defaultTaxRateBp()),
                'is_tax_invoice' => (bool) $expense->is_tax_invoice_received,
                'is_claimable' => false,
                'claim_block_reason' => $expense->claim_block_reason,
                'revenue_or_capital' => $expense->revenue_or_capital,
                'created_by' => $userId,
            ]);
        }

        if ($gstLaar <= 0) {
            return null;
        }

        $invoiceDate = Carbon::parse($expense->supplier_invoice_date ?? $expense->expense_date);

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($invoiceDate, LedgerSourceType::Expense->value, $expense->id),
            'source_type' => LedgerSourceType::Expense->value,
            'source_id' => $expense->id,
            'direction' => LedgerDirection::Input->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $expense->taxable_activity_no ?? $this->settings->get()->taxable_activity_no,
            'supplier_id' => $expense->supplier_id,
            'supplier_tin' => $expense->supplier_tin,
            'document_no' => $expense->supplier_invoice_no ?? $expense->expense_number,
            'document_date' => $invoiceDate->toDateString(),
            'taxable_value_laar' => (int) ($expense->amount_excluding_gst_laar ?? 0),
            'tax_laar' => $gstLaar,
            'total_laar' => (int) (($expense->amount_excluding_gst_laar ?? 0) + $gstLaar),
            'rate_bp' => (int) ($expense->gst_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'invoice_basis_date' => $invoiceDate->toDateString(),
            'is_tax_invoice' => (bool) $expense->is_tax_invoice_received,
            'is_claimable' => true,
            'revenue_or_capital' => $expense->revenue_or_capital,
            'created_by' => $userId,
        ]);
    }

    /** @param array<string, mixed> $data */
    public function postManualAdjustment(array $data, int $userId): TaxLedgerEntry
    {
        $date = Carbon::parse($data['document_date'] ?? now());
        $periodKey = $data['period_key'] ?? $this->resolvePeriodKey(
            $date,
            LedgerSourceType::ManualAdjustment->value,
            (int) ($data['source_id'] ?? 0),
        );

        return $this->upsertEntry(array_merge($data, [
            'period_key' => $periodKey,
            'source_type' => LedgerSourceType::ManualAdjustment->value,
            'source_id' => $data['source_id'] ?? 0,
            'direction' => LedgerDirection::Adjustment->value,
            'created_by' => $userId,
        ]));
    }

    private function postOrderOutput(
        Order $order,
        Carbon $date,
        bool $isTaxInvoice,
        ?string $customerTin,
        ?int $userId,
    ): ?TaxLedgerEntry {
        $order->loadMissing('items');

        $subtotalLaar = (int) ($order->subtotal_laar ?? round((float) $order->subtotal * 100));
        $taxLaar = (int) ($order->tax_laar ?? round((float) $order->tax_amount * 100));

        $parts = EffectiveDiscount::partsFromOrder($order);
        $taxableLaar = max(0, $subtotalLaar - EffectiveDiscount::effectiveTotalLaar($subtotalLaar, $parts));
        // GST supply total = taxable merchandise + tax (excludes delivery/packaging/tip).
        $totalLaar = $taxableLaar + $taxLaar;

        if ($totalLaar <= 0) {
            return null;
        }

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($date, LedgerSourceType::Order->value, $order->id),
            'source_type' => LedgerSourceType::Order->value,
            'source_id' => $order->id,
            'direction' => LedgerDirection::Output->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'taxable_activity_no' => $this->settings->get()->taxable_activity_no,
            'customer_id' => $order->customer_id,
            'customer_tin' => $customerTin,
            'document_no' => $order->order_number ?? ('ORD-' . $order->id),
            'document_date' => $date->toDateString(),
            'taxable_value_laar' => $taxableLaar,
            'tax_laar' => $taxLaar,
            'total_laar' => $totalLaar,
            'rate_bp' => (int) ($order->tax_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'channel' => $order->order_type ?? $order->channel ?? null,
            'payment_basis_date' => $date->toDateString(),
            'is_tax_invoice' => $isTaxInvoice,
            'is_claimable' => false,
            'created_by' => $userId,
        ]);
    }

    private function reclassifyOrderToTaxInvoice(
        TaxLedgerEntry $existing,
        Invoice $invoice,
        ?int $userId,
    ): TaxLedgerEntry {
        if ($this->periods->isLocked($existing->period_key)) {
            $nextPeriod = $this->periods->nextOpenPeriodKey($existing->period_key);
            Log::info('GST reclassify moved to next open period', [
                'order_id' => $existing->source_id,
                'from' => $existing->period_key,
                'to' => $nextPeriod,
            ]);

            return $this->upsertEntry([
                'period_key' => $nextPeriod,
                'source_type' => LedgerSourceType::Invoice->value,
                'source_id' => $invoice->id,
                'direction' => LedgerDirection::Adjustment->value,
                'tax_code' => GstTaxCode::Standard8->value,
                'taxable_activity_no' => $this->settings->get()->taxable_activity_no,
                'customer_id' => $invoice->customer_id,
                'customer_tin' => $invoice->customer_tin,
                'document_no' => $invoice->invoice_number,
                'document_date' => Carbon::parse($invoice->issue_date)->toDateString(),
                'taxable_value_laar' => (int) ($invoice->subtotal_laar ?? round((float) $invoice->subtotal * 100)),
                'tax_laar' => (int) ($invoice->tax_laar ?? round((float) $invoice->tax_amount * 100)),
                'total_laar' => (int) ($invoice->total_laar ?? round((float) $invoice->total * 100)),
                'rate_bp' => (int) ($invoice->tax_rate_bp ?: $this->settings->defaultTaxRateBp()),
                'invoice_basis_date' => Carbon::parse($invoice->issue_date)->toDateString(),
                'is_tax_invoice' => true,
                'is_claimable' => false,
                'metadata' => ['reclassified_from_order' => $existing->source_id],
                'created_by' => $userId,
            ]);
        }

        $existing->update([
            'is_tax_invoice' => true,
            'customer_tin' => $invoice->customer_tin,
            'customer_id' => $invoice->customer_id,
            'invoice_basis_date' => Carbon::parse($invoice->issue_date)->toDateString(),
            'document_no' => $invoice->invoice_number,
            'metadata' => array_merge($existing->metadata ?? [], ['invoice_id' => $invoice->id]),
        ]);

        return $existing->fresh();
    }

    private function postNonClaimablePurchase(Purchase $purchase, ?int $userId): ?TaxLedgerEntry
    {
        $gstLaar = (int) ($purchase->gst_laar ?? 0);
        if ($gstLaar <= 0) {
            return null;
        }

        $invoiceDate = Carbon::parse($purchase->supplier_invoice_date ?? $purchase->purchase_date ?? now());

        return $this->upsertEntry([
            'period_key' => $this->resolvePeriodKey($invoiceDate, LedgerSourceType::Purchase->value, $purchase->id),
            'source_type' => LedgerSourceType::Purchase->value,
            'source_id' => $purchase->id,
            'direction' => LedgerDirection::Input->value,
            'tax_code' => GstTaxCode::Standard8->value,
            'supplier_id' => $purchase->supplier_id,
            'supplier_tin' => $purchase->supplier_tin,
            'document_no' => $purchase->supplier_invoice_no ?? $purchase->purchase_number,
            'document_date' => $invoiceDate->toDateString(),
            'taxable_value_laar' => (int) ($purchase->amount_excluding_gst_laar ?? 0),
            'tax_laar' => $gstLaar,
            'total_laar' => (int) ($purchase->total_laar ?? round((float) $purchase->total * 100)),
            'rate_bp' => (int) ($purchase->gst_rate_bp ?: $this->settings->defaultTaxRateBp()),
            'is_claimable' => false,
            'claim_block_reason' => $purchase->claim_block_reason,
            'created_by' => $userId,
        ]);
    }

    private function resolvePeriodKey(Carbon $date, string $sourceType, int $sourceId): string
    {
        $key = $this->periods->periodKeyForDate($date);

        if ($this->periods->isLocked($key)) {
            $next = $this->periods->nextOpenPeriodKey($key);
            Log::info('GST posting redirected to open period', [
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'from' => $key,
                'to' => $next,
            ]);

            return $next;
        }

        return $key;
    }

    /** @param array<string, mixed> $data */
    private function upsertEntry(array $data): TaxLedgerEntry
    {
        $keys = [
            'source_type' => $data['source_type'],
            'source_id' => $data['source_id'],
            'direction' => $data['direction'],
            'tax_code' => $data['tax_code'] ?? GstTaxCode::Standard8->value,
            'document_no' => $data['document_no'],
        ];

        return TaxLedgerEntry::query()->updateOrCreate($keys, $data);
    }
}
