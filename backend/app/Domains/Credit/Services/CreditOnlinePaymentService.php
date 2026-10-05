<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * A customer's credit invoice paid online (owner, 2026-10-05: "payment
 * links"). The pay link in a reminder opens the invoice page, whose Pay
 * button starts a BML card payment against the invoice; when the gateway
 * confirms it, this records the repayment on the credit ledger exactly as a
 * card repayment at the till would, once, however many times the gateway
 * tells us.
 */
final class CreditOnlinePaymentService
{
    public function __construct(private readonly CreditLedgerService $ledger) {}

    public static function isCreditInvoice(Invoice $invoice): bool
    {
        return $invoice->trade_account_id === null
            && $invoice->customer_id !== null
            && $invoice->type === 'sale'
            && $invoice->isOnCreditAccount();
    }

    public function settleConfirmedBmlPayment(Payment $payment, User $systemActor): void
    {
        if ($payment->invoice_id === null || $payment->order_id !== null) {
            return;
        }

        DB::transaction(function () use ($payment, $systemActor): void {
            $locked = Payment::where('id', $payment->id)->lockForUpdate()->firstOrFail();
            if (CustomerCreditLedger::where('payment_id', $locked->id)->where('type', 'payment')->exists()) {
                return;
            }

            $invoice = Invoice::lockForUpdate()->findOrFail($locked->invoice_id);
            $customer = Customer::lockForUpdate()->findOrFail($invoice->customer_id);

            if (!in_array((string) $locked->status, ['confirmed', 'paid', 'completed'], true)) {
                $locked->update(['status' => 'confirmed', 'processed_at' => now()]);
            }

            $ledger = $this->ledger->recordRepayment(
                $customer,
                (int) $locked->amount_laar,
                'card',
                $systemActor,
                [$invoice->id],
                $locked->provider_transaction_id,
                'Paid online (BML) against credit invoice ' . $invoice->invoice_number,
            );
            $ledger->update(['payment_id' => $locked->id]);
        });
    }
}
