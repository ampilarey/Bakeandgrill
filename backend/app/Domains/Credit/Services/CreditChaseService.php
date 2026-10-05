<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Chasing a credit balance by hand, from the Credit accounts page (owner,
 * 2026-10-05: "Including sms option payment links etc"). Two texts: a
 * reminder of what is owed, and a link to pay it online. Both go through
 * the credit reminder SMS type, so the owner's switch for reminders and the
 * customer's own opt-outs apply, and both land in the SMS log against the
 * customer.
 */
final class CreditChaseService
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $builder,
        private readonly CreditLedgerService $ledger,
    ) {}

    /** A reminder of the balance: the oldest open invoice when there is one, else the balance itself. */
    public function sendReminder(Customer $customer, User $staff, ?string $message = null): SmsLog
    {
        $this->assertReachable($customer);
        $invoice = $this->oldestOpenInvoice($customer);
        $balance = max(0, (int) $customer->credit_balance_laar);
        if ($balance <= 0 && $invoice === null) {
            throw ValidationException::withMessages(['message' => ['This customer owes nothing.']]);
        }

        $vars = $this->vars($customer, $invoice, $balance);
        $text = trim((string) $message) !== ''
            ? $this->builder->build('credit_reminder_manual', $vars, (string) $message)
            : ($invoice !== null
                ? $this->builder->build('credit_reminder_overdue', $vars, 'Bake & Grill: Credit invoice {{invoice_number}} - MVR {{amount}}, due {{due_date}}. Your balance is MVR {{balance}}. View: {{link}}')
                : $this->builder->build('credit_balance_reminder', $vars, 'Bake & Grill: your credit account balance is MVR {{balance}}. Please settle at your earliest convenience. Thank you!'));

        return $this->send($customer, $staff, $text, $invoice, 'reminder');
    }

    /** A link to pay the oldest open invoice online, by card through BML. */
    public function sendPayLink(Customer $customer, User $staff): SmsLog
    {
        $this->assertReachable($customer);
        $invoice = $this->oldestOpenInvoice($customer);
        if ($invoice === null) {
            throw ValidationException::withMessages(['message' => ['No open credit invoice to pay. A pay link needs an invoice; record a repayment instead for a balance with none.']]);
        }

        $vars = $this->vars($customer, $invoice, max(0, (int) $customer->credit_balance_laar));
        $text = $this->builder->build(
            'credit_pay_link',
            $vars,
            'Bake & Grill: pay credit invoice {{invoice_number}} (MVR {{amount}}) online by card: {{link}} - thank you!',
        );

        return $this->send($customer, $staff, $text, $invoice, 'pay_link');
    }

    public function oldestOpenInvoice(Customer $customer): ?Invoice
    {
        return Invoice::query()
            ->where('customer_id', $customer->id)
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->orderBy('due_date')
            ->orderBy('id')
            ->first();
    }

    /** @return array<string, string> */
    private function vars(Customer $customer, ?Invoice $invoice, int $balanceLaar): array
    {
        return [
            'name' => (string) ($customer->name ?: 'customer'),
            'balance' => number_format($balanceLaar / 100, 2, '.', ''),
            'invoice_number' => (string) ($invoice?->invoice_number ?? ''),
            'amount' => number_format(($invoice?->balanceDueLaar() ?? $balanceLaar) / 100, 2, '.', ''),
            'due_date' => $invoice?->due_date ? $invoice->due_date->format('d M Y') : '',
            'days_overdue' => (string) ($invoice?->due_date && $invoice->due_date->isPast() ? $invoice->due_date->diffInDays(now()->startOfDay()) : 0),
            'link' => $invoice ? rtrim((string) config('app.url'), '/') . '/invoices/' . $invoice->token : '',
        ];
    }

    private function assertReachable(Customer $customer): void
    {
        if (trim((string) $customer->phone) === '') {
            throw ValidationException::withMessages(['message' => ['This customer has no phone number.']]);
        }
        if ($customer->sms_opt_out) {
            throw ValidationException::withMessages(['message' => ['This customer has opted out of SMS and cannot be texted.']]);
        }
    }

    private function send(Customer $customer, User $staff, string $text, ?Invoice $invoice, string $kind): SmsLog
    {
        return $this->sms->send(new SmsMessage(
            to: $this->sms->normalizePhone((string) $customer->phone),
            message: $text,
            type: 'credit_payment_reminder',
            customerId: $customer->id,
            referenceType: $invoice ? 'invoice' : Customer::class,
            referenceId: (string) ($invoice?->id ?? $customer->id),
            idempotencyKey: sprintf('credit:%s:%d:%s', $kind, $customer->id, now()->format('YmdHi')),
            actingUserId: $staff->id,
        ));
    }
}
