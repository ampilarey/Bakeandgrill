<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Domains\Deposits\Support\WalletActor;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Payments\Services\PaymentService;
use App\Domains\Payments\Services\PendingBmlPaymentHealer;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\CreditPayment;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Support\BusinessDay;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * The credit account paid online as a whole (owner, 2026-10-21), not one
 * invoice at a time: from the order app's Credit panel or the public
 * statement page (/credit/{token}), both of which show the statement this
 * service builds. A payment is a CreditPayment row the BML payment points
 * at (payments.credit_payment_id); settle() records the repayment once,
 * oldest invoices first, and the Phase 1 repayment text tells the customer.
 * Money beyond what is owed (the balance moved while they paid) goes into
 * the wallet rather than being refused.
 *
 * Also the monthly statement text (credit:send-statements).
 */
final class CreditPaymentService
{
    public const TYPE_STATEMENT = 'customer_credit_statement';

    public const FALLBACK_STATEMENT = 'Bake & Grill: your credit account statement for {{month}}: you owe MVR {{balance}}{{overdue_note}}. Your invoices, and Pay online: {{link}}';

    public const LIFETIME_HOURS = 24;

    private const HEAL_THROTTLE_SECONDS = 60;

    public function __construct(
        private readonly PaymentService $payments,
        private readonly CreditLedgerService $ledger,
        private readonly CreditEligibilityService $eligibility,
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $builder,
    ) {}

    /** The customer's statement page; the token is made the first time it is asked for. */
    public static function statementUrl(Customer $customer): string
    {
        if (trim((string) $customer->credit_statement_token) === '') {
            $customer->forceFill(['credit_statement_token' => \Illuminate\Support\Str::random(48)])->save();
        }

        return rtrim((string) config('app.url'), '/') . '/credit/' . $customer->credit_statement_token;
    }

    /**
     * What the statement shows: balance, limit, what is overdue, and every
     * open invoice with its page.
     *
     * @return array<string, mixed>
     */
    public function statement(Customer $customer): array
    {
        $customer = $customer->fresh() ?? $customer;
        $summary = $this->eligibility->creditSummary($customer);
        $today = BusinessDay::todayYmd();
        $rows = $this->ledger->openCreditInvoices($customer);
        $tokens = Invoice::query()->whereIn('id', array_column($rows, 'id'))->pluck('token', 'id');

        $overdue = 0;
        $invoices = [];
        foreach ($rows as $inv) {
            $due = $inv['due_date'] ?? null;
            $isOverdue = $due !== null && $due < $today;
            $days = $isOverdue ? (int) Carbon::parse($due)->diffInDays(Carbon::parse($today)) : 0;
            if ($isOverdue) {
                $overdue += (int) $inv['balance_due_laar'];
            }
            $invoices[] = [
                'id' => $inv['id'],
                'invoice_number' => $inv['invoice_number'],
                'order_id' => $inv['order_id'],
                'issue_date' => $inv['issue_date'],
                'due_date' => $due,
                'overdue' => $isOverdue,
                'days_overdue' => $days,
                'total_laar' => (int) $inv['total_laar'],
                'balance_due_laar' => (int) $inv['balance_due_laar'],
                'view_url' => isset($tokens[$inv['id']]) ? rtrim((string) config('app.url'), '/') . '/invoices/' . $tokens[$inv['id']] : null,
            ];
        }

        $balance = max(0, (int) $summary['balance_laar']);

        return [
            'enabled' => (bool) $summary['enabled'],
            'status' => (string) $summary['status'],
            'balance_laar' => $balance,
            'available_laar' => (int) $summary['available_laar'],
            'limit_laar' => (int) $summary['limit_laar'],
            'overdue_laar' => $overdue,
            'next_due_date' => $summary['next_payment_due_date'] ?? null,
            'payment_terms_days' => (int) $summary['payment_terms_days'],
            'invoices' => $invoices,
            'statement_url' => self::statementUrl($customer),
            'can_pay_online' => $balance > 0,
        ];
    }

    /**
     * The order app's Pay now: the whole balance unless an amount is given.
     *
     * @return array{credit_payment: CreditPayment, payment_url: string}
     */
    public function startFromApp(Customer $customer, ?int $amountLaar = null): array
    {
        return $this->start($customer, $amountLaar, CreditPayment::SOURCE_APP);
    }

    /** The statement page's Pay button. Returns the bank's page. */
    public function startFromStatement(Customer $customer, ?int $amountLaar = null): string
    {
        return $this->start($customer, $amountLaar, CreditPayment::SOURCE_STATEMENT)['payment_url'];
    }

    /** @return array{credit_payment: CreditPayment, payment_url: string} */
    private function start(Customer $customer, ?int $amountLaar, string $source): array
    {
        $owed = max(0, (int) ($customer->fresh()?->credit_balance_laar ?? 0));
        if ($owed <= 0) {
            abort(422, 'Nothing is owed on this account.');
        }
        $amount = $amountLaar ?? $owed;
        if ($amount <= 0 || $amount > $owed) {
            abort(422, 'The amount must be between MVR 1.00 and what is owed, MVR ' . self::mvr($owed) . '.');
        }
        app(ServiceAvailabilityService::class)->assertAvailable('online_payment');

        $row = CreditPayment::create([
            'customer_id' => $customer->id,
            'token' => CreditPayment::newToken(),
            'amount_laar' => $amount,
            'status' => CreditPayment::STATUS_PENDING,
            'source' => $source,
            'expires_at' => now()->addHours(self::LIFETIME_HOURS),
        ]);

        $result = $this->payments->initiateBmlCreditPayment($row, $this->returnUrl($row));
        $url = (string) ($result['payment_url'] ?? '');
        if ($url === '') {
            abort(422, ($result['reused'] ?? false)
                ? 'This payment is already made.'
                : 'Online payment is not available right now. Please try again shortly.');
        }

        return ['credit_payment' => $row->fresh(), 'payment_url' => $url];
    }

    /**
     * The bank confirmed it: record the repayment once, oldest invoices
     * first. Inside the confirm transaction, the payment locked and
     * confirmed. If the balance has shrunk since they pressed Pay, the
     * surplus goes into their wallet instead of being refused.
     */
    public function settle(CreditPayment $row, Payment $payment): void
    {
        $locked = CreditPayment::query()->whereKey($row->id)->lockForUpdate()->firstOrFail();
        if (CustomerCreditLedger::query()->where('payment_id', $payment->id)->where('type', 'payment')->exists()) {
            return;
        }
        $customer = Customer::query()->lockForUpdate()->findOrFail($locked->customer_id);
        $amount = (int) $payment->amount_laar;
        if ($amount <= 0) {
            Log::error('credit payment: confirmed payment carries no amount', ['credit_payment_id' => $locked->id, 'payment_id' => $payment->id]);

            return;
        }

        $owed = max(0, (int) $customer->credit_balance_laar);
        $toAccount = min($amount, $owed);
        $surplus = $amount - $toAccount;
        $actor = WalletActor::system();
        $ledgerId = null;

        if ($toAccount > 0) {
            $ledger = $this->ledger->recordRepayment(
                $customer,
                $toAccount,
                'card',
                $actor,
                null,
                (string) $payment->provider_transaction_id,
                'Paid online (BML) against the credit account',
                source: 'online',
            );
            $ledger->update(['payment_id' => $payment->id]);
            $ledgerId = $ledger->id;
        }
        if ($surplus > 0) {
            Log::warning('credit payment: more than was owed; the rest goes to the wallet', ['credit_payment_id' => $locked->id, 'surplus_laar' => $surplus]);
            app(DepositLedgerService::class)->topUp(
                $customer->fresh(),
                $surplus,
                'online',
                $actor,
                'BML ' . (string) $payment->provider_transaction_id,
                'Paid online against the credit account; more than was owed, so the rest is in the wallet',
                null,
                null,
                $payment->id,
            );
        }

        $locked->update([
            'status' => CreditPayment::STATUS_PAID,
            'amount_laar' => $amount,
            'payment_id' => $payment->id,
            'ledger_id' => $ledgerId,
            'paid_at' => now(),
        ]);
    }

    /** Ask the bank about a payment still shown pending; true when paid afterwards. Never throws. */
    public function heal(CreditPayment $row, bool $force = false): bool
    {
        if ($row->status === CreditPayment::STATUS_PAID) {
            return true;
        }
        $payment = $this->inFlightPayment($row);
        if ($payment === null) {
            return false;
        }
        if (!$force && !Cache::add('bml:heal:credit:' . $row->id, 1, self::HEAL_THROTTLE_SECONDS)) {
            return false;
        }
        try {
            $this->payments->confirmFromCreditPaymentReturnUrl($row->id, (string) $payment->provider_transaction_id);
        } catch (\Throwable $e) {
            Log::warning('credit payment heal: could not ask the bank', ['credit_payment_id' => $row->id, 'error' => $e->getMessage()]);

            return false;
        }

        return $row->fresh()->status === CreditPayment::STATUS_PAID;
    }

    /** The customer's newest payment still waiting on the bank, healed; for the statement page. */
    public function healLatestFor(Customer $customer): void
    {
        $row = CreditPayment::query()
            ->where('customer_id', $customer->id)
            ->where('status', CreditPayment::STATUS_PENDING)
            ->latest('id')
            ->first();
        if ($row !== null) {
            $this->heal($row);
            $this->expireIfDue($row->fresh());
        }
    }

    public function inFlightPayment(CreditPayment $row): ?Payment
    {
        return Payment::query()
            ->where('credit_payment_id', $row->id)
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', PendingBmlPaymentHealer::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(PendingBmlPaymentHealer::LOOKBACK_HOURS))
            ->latest('id')
            ->first();
    }

    public function expireIfDue(CreditPayment $row): CreditPayment
    {
        if ($row->status === CreditPayment::STATUS_PENDING
            && $row->expires_at !== null
            && $row->expires_at->isPast()
            && $this->inFlightPayment($row) === null) {
            $row->update(['status' => CreditPayment::STATUS_EXPIRED]);
        }

        return $row->fresh();
    }

    /** @return array{checked: int, settled: int, expired: int} */
    public function sweep(): array
    {
        $ids = Payment::query()
            ->whereNotNull('credit_payment_id')
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', PendingBmlPaymentHealer::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(PendingBmlPaymentHealer::LOOKBACK_HOURS))
            ->where('created_at', '<=', now()->subMinutes(PendingBmlPaymentHealer::SWEEP_MIN_AGE_MINUTES))
            ->distinct()
            ->pluck('credit_payment_id');

        $checked = 0;
        $settled = 0;
        foreach (CreditPayment::query()->whereIn('id', $ids)->where('status', CreditPayment::STATUS_PENDING)->get() as $row) {
            $checked++;
            if ($this->heal($row, force: true)) {
                $settled++;
            }
        }
        $expired = 0;
        $due = CreditPayment::query()->where('status', CreditPayment::STATUS_PENDING)->whereNotNull('expires_at')->where('expires_at', '<', now())->get();
        foreach ($due as $row) {
            if ($this->expireIfDue($row)->status === CreditPayment::STATUS_EXPIRED) {
                $expired++;
            }
        }

        return ['checked' => $checked, 'settled' => $settled, 'expired' => $expired];
    }

    public function returnUrl(CreditPayment $row): string
    {
        return route('bml.return', [
            'creditPayId' => $row->id,
            'creditPayToken' => $row->token,
            'creditBack' => $row->source === CreditPayment::SOURCE_APP ? 'app' : 'page',
        ]);
    }

    /**
     * The monthly statement text: what is owed, what is overdue, the page.
     * Honours the customer's own reminder switch, as the reminders do.
     */
    public function sendStatement(Customer $customer, string $monthLabel): bool
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '' || !$customer->credit_reminder_sms) {
            return false;
        }
        $statement = $this->statement($customer);
        if ($statement['balance_laar'] <= 0) {
            return false;
        }
        $overdue = (int) $statement['overdue_laar'];
        $dv = \App\Domains\Notifications\Support\CustomerSmsText::language($phone) === 'dv';
        $overdueNote = $overdue > 0
            ? ($dv ? sprintf('، އޭގެ ތެރެއިން MVR %s މުއްދަތު ހަމަވެފައި', self::mvr($overdue)) : ', of which MVR ' . self::mvr($overdue) . ' is overdue')
            : '';

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $this->builder->build(self::TYPE_STATEMENT, [
                    'month' => $monthLabel,
                    'balance' => self::mvr((int) $statement['balance_laar']),
                    'overdue' => self::mvr($overdue),
                    'overdue_note' => $overdueNote,
                    'invoices' => (string) count($statement['invoices']),
                    'link' => (string) $statement['statement_url'],
                    'name' => (string) ($customer->name ?? ''),
                ], self::FALLBACK_STATEMENT, $phone),
                type: self::TYPE_STATEMENT,
                customerId: $customer->id,
                referenceType: 'customer',
                referenceId: (string) $customer->id,
                idempotencyKey: 'credit:statement:' . $customer->id . ':' . $monthLabel,
            ));

            return true;
        } catch (\Throwable $e) {
            Log::warning('credit statement SMS failed', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);

            return false;
        }
    }

    public static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
