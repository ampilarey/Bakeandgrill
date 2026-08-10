<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Credit\Services\CreditLedgerService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\TradeDelivery;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Record a receivable payment against one or more trade invoices.
 * Uses customers.credit.repay permission at the route layer.
 * No shadow orders — payments.invoice_id is set, order_id stays null.
 */
final class TradeReceivablePaymentService
{
    public function __construct(
        private readonly CreditLedgerService $ledger,
        private readonly GstLedgerPoster $gstPoster,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  list<int>|null  $invoiceIds
     */
    public function record(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        string $idempotencyKey,
        ?array $invoiceIds = null,
        ?string $reference = null,
        ?string $notes = null,
    ): array {
        $existing = Payment::where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            $ledger = CustomerCreditLedger::where('payment_id', $existing->id)->where('type', 'payment')->first();

            return ['payment' => $existing, 'ledger' => $ledger];
        }

        if ($amountLaar <= 0) {
            throw ValidationException::withMessages(['amount_laar' => ['Amount must be greater than zero.']]);
        }

        $allowed = ['cash', 'card', 'bank_transfer', 'bml_connect'];
        if (! in_array($method, $allowed, true)) {
            abort(422, 'Invalid payment method.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $method, $actor, $idempotencyKey, $invoiceIds, $reference, $notes) {
            $again = Payment::where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($again) {
                $ledger = CustomerCreditLedger::where('payment_id', $again->id)->where('type', 'payment')->first();

                return ['payment' => $again, 'ledger' => $ledger];
            }

            $lockedCustomer = Customer::lockForUpdate()->findOrFail($customer->id);

            // Pick primary invoice for the payment row (first targeted, or first open trade invoice).
            $primaryInvoice = $this->resolvePrimaryInvoice($lockedCustomer->id, $invoiceIds);
            if ($primaryInvoice === null) {
                abort(422, 'No open wholesale invoice to apply this payment to.');
            }

            $payment = Payment::create([
                'idempotency_key' => $idempotencyKey,
                'order_id' => null,
                'invoice_id' => $primaryInvoice->id,
                'collected_by_user_id' => $actor->id,
                'method' => $method === 'bml_connect' ? 'bml_connect' : $method,
                'gateway' => $method === 'bml_connect' ? 'bml' : null,
                'currency' => 'MVR',
                'amount' => round($amountLaar / 100, 2),
                'amount_laar' => $amountLaar,
                'status' => 'confirmed',
                'reference_number' => $reference,
                'processed_at' => now(),
            ]);

            // Ledger repayment also applies amount_paid_laar on invoices + cash_movements.
            $ledgerMethod = $method === 'bml_connect' ? 'card' : $method;
            $ledger = $this->ledger->recordRepayment(
                $lockedCustomer,
                $amountLaar,
                $ledgerMethod,
                $actor,
                $invoiceIds,
                $reference,
                $notes ?? 'Wholesale invoice repayment',
            );

            // Link ledger row to this payment for idempotency / audit.
            if ($ledger->payment_id === null) {
                $ledger->update(['payment_id' => $payment->id]);
            }

            $this->gstPoster->postTradeInvoiceOnPayment($payment->fresh(['invoice']), $actor->id);

            $this->markDeliveriesSettledIfPaid($invoiceIds ?? [$primaryInvoice->id]);

            $this->audit->log(
                'trade.invoice.payment',
                'Payment',
                $payment->id,
                [],
                [
                    'amount_laar' => $amountLaar,
                    'method' => $method,
                    'invoice_ids' => $invoiceIds,
                ],
            );

            return ['payment' => $payment->fresh(), 'ledger' => $ledger->fresh()];
        });
    }

    /**
     * Settle a BML invoice payment that was created as pending and is now confirmed.
     * Idempotent — duplicate callbacks must not pay twice.
     */
    public function settleConfirmedBmlPayment(Payment $payment, User $systemActor): void
    {
        if ($payment->invoice_id === null || $payment->order_id !== null) {
            return;
        }

        DB::transaction(function () use ($payment, $systemActor) {
            $locked = Payment::where('id', $payment->id)->lockForUpdate()->firstOrFail();
            if (in_array((string) $locked->status, ['confirmed', 'paid', 'completed'], true)
                && CustomerCreditLedger::where('payment_id', $locked->id)->where('type', 'payment')->exists()) {
                return;
            }

            $invoice = Invoice::lockForUpdate()->findOrFail($locked->invoice_id);
            $customer = Customer::lockForUpdate()->findOrFail($invoice->customer_id);

            if (! in_array((string) $locked->status, ['confirmed', 'paid', 'completed'], true)) {
                $locked->update(['status' => 'confirmed', 'processed_at' => now()]);
            }

            if (CustomerCreditLedger::where('payment_id', $locked->id)->where('type', 'payment')->exists()) {
                return;
            }

            $amountLaar = (int) $locked->amount_laar;
            $ledger = $this->ledger->recordRepayment(
                $customer,
                $amountLaar,
                'card',
                $systemActor,
                [$invoice->id],
                $locked->provider_transaction_id,
                'BML payment for wholesale invoice '.$invoice->invoice_number,
            );
            $ledger->update(['payment_id' => $locked->id]);

            $this->gstPoster->postTradeInvoiceOnPayment($locked->fresh(['invoice']), $systemActor->id);
            $this->markDeliveriesSettledIfPaid([$invoice->id]);
        });
    }

    /**
     * @param  list<int>|null  $invoiceIds
     */
    private function resolvePrimaryInvoice(int $customerId, ?array $invoiceIds): ?Invoice
    {
        $q = Invoice::query()
            ->where('customer_id', $customerId)
            ->where('type', 'sale')
            ->whereNotNull('trade_account_id')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw('total_laar > amount_paid_laar')
            ->orderBy('issue_date');

        if ($invoiceIds !== null && $invoiceIds !== []) {
            $q->whereIn('id', $invoiceIds);
        }

        return $q->first();
    }

    /**
     * @param  list<int>  $invoiceIds
     */
    private function markDeliveriesSettledIfPaid(array $invoiceIds): void
    {
        $invoices = Invoice::whereIn('id', $invoiceIds)->get();
        foreach ($invoices as $invoice) {
            if ($invoice->status !== 'paid') {
                continue;
            }
            $lineIds = \App\Models\TradeInvoiceAllocation::where('invoice_id', $invoice->id)
                ->pluck('trade_delivery_line_id');
            $deliveryIds = \App\Models\TradeDeliveryLine::whereIn('id', $lineIds)
                ->pluck('trade_delivery_id')
                ->unique();
            TradeDelivery::whereIn('id', $deliveryIds)
                ->where('status', TradeDelivery::STATUS_INVOICED)
                ->update(['status' => TradeDelivery::STATUS_SETTLED]);
        }
    }
}
