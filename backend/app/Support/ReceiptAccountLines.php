<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Invoice;
use App\Models\Order;

/**
 * What a sale did to the customer's credit account or wallet, for the
 * receipt page, the receipt PDF, the confirmation email and the text sent
 * when the sale is paid (owner, 2026-10-21: a sale on credit said only
 * "Receipt for #…", with no due date, no balance and nothing to pay from).
 * Read from the ledgers on every open, so an old receipt shows it too; the
 * balances are the account's now, not as they stood at the sale.
 */
final class ReceiptAccountLines
{
    /**
     * @return array{
     *   credit: ?array{amount_laar: int, invoice_number: ?string, due_date: ?\DateTimeInterface, invoice_balance_due_laar: int, invoice_paid: bool, balance_laar: int, available_laar: int, pay_url: ?string},
     *   wallet: ?array{amount_laar: int, balance_laar: int}
     * }
     */
    public static function for(Order $order): array
    {
        return [
            'credit' => self::credit($order),
            'wallet' => self::wallet($order),
        ];
    }

    /** @return ?array<string, mixed> */
    private static function credit(Order $order): ?array
    {
        $charges = CustomerCreditLedger::query()
            ->where('order_id', $order->id)
            ->where('type', 'charge')
            ->orderBy('id')
            ->get();
        if ($charges->isEmpty()) {
            return null;
        }

        $invoice = Invoice::query()
            ->whereIn('id', $charges->pluck('invoice_id')->filter()->all())
            ->orderByDesc('id')
            ->first()
            ?? Invoice::query()->where('order_id', $order->id)->where('type', 'sale')->orderByDesc('id')->first();

        $customer = $order->relationLoaded('customer') ? $order->customer : Customer::query()->find($order->customer_id);
        $balance = (int) ($customer?->credit_balance_laar ?? 0);
        $active = $customer !== null && (bool) $customer->credit_enabled && ($customer->credit_status ?? '') === 'active';
        $invoiceDue = $invoice?->balanceDueLaar() ?? 0;

        return [
            'amount_laar' => (int) $charges->sum('amount_laar'),
            'invoice_number' => $invoice?->invoice_number,
            'due_date' => $invoice?->due_date,
            'invoice_balance_due_laar' => max(0, $invoiceDue),
            'invoice_paid' => $invoice !== null && $invoiceDue <= 0,
            'balance_laar' => max(0, $balance),
            'available_laar' => $active ? max(0, (int) $customer->credit_limit_laar - $balance) : 0,
            // The site's own address, as the reminders use: a text must not
            // carry the till's request host.
            'pay_url' => $invoice ? rtrim((string) config('app.url'), '/') . '/invoices/' . $invoice->token : null,
        ];
    }

    /** @return ?array<string, mixed> */
    private static function wallet(Order $order): ?array
    {
        $usage = CustomerDepositLedger::query()
            ->where('order_id', $order->id)
            ->where('type', 'usage')
            ->orderBy('id')
            ->get();
        if ($usage->isEmpty()) {
            return null;
        }

        $account = $order->customer_id
            ? CustomerDepositAccount::query()->where('customer_id', $order->customer_id)->first()
            : null;

        return [
            'amount_laar' => (int) abs((int) $usage->sum('amount_laar')),
            'balance_laar' => max(0, (int) ($account?->balance_laar ?? $usage->last()->balance_after_laar)),
        ];
    }

    public static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
