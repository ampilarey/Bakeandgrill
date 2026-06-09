<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Http\Controllers\Api\InvoiceController;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\ShiftAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class CreditLedgerService
{
    public function __construct(
        private readonly CreditEligibilityService $eligibility,
        private readonly AuditLogService $audit,
        private readonly ShiftAccessService $shifts,
    ) {}

    public function approveCredit(
        Customer $customer,
        int $limitLaar,
        User $actor,
        ?string $notes = null,
        ?Request $request = null,
        ?int $paymentTermsDays = null,
    ): Customer {
        if ($limitLaar <= 0) {
            abort(422, 'Credit limit must be greater than zero.');
        }

        $termsDays = $this->eligibility->validatePaymentTermsDays(
            $paymentTermsDays ?? CreditEligibilityService::DEFAULT_PAYMENT_TERMS_DAYS,
        );

        return DB::transaction(function () use ($customer, $limitLaar, $actor, $notes, $request, $termsDays) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $old = $this->eligibility->creditSummary($locked);

            $locked->update([
                'credit_enabled' => true,
                'credit_approved_by' => $actor->id,
                'credit_approved_at' => now(),
                'credit_limit_laar' => $limitLaar,
                'credit_status' => 'active',
                'credit_notes' => $notes ?? $locked->credit_notes,
                'credit_payment_terms_days' => $termsDays,
                'credit_reminder_sms' => true,
            ]);

            $this->audit->log(
                'customer.credit.approved',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                [],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function disableCredit(Customer $customer, User $actor, ?Request $request = null): Customer
    {
        return DB::transaction(function () use ($customer, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $old = $this->eligibility->creditSummary($locked);

            $locked->update([
                'credit_enabled' => false,
                'credit_status' => 'blocked',
            ]);

            $this->audit->log(
                'customer.credit.disabled',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                [],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function updateLimit(
        Customer $customer,
        int $limitLaar,
        User $actor,
        bool $override = false,
        ?Request $request = null,
    ): Customer {
        if ($limitLaar < 0) {
            abort(422, 'Credit limit cannot be negative.');
        }

        return DB::transaction(function () use ($customer, $limitLaar, $override, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $balance = (int) $locked->credit_balance_laar;

            if (!$override && $limitLaar < $balance) {
                abort(422, sprintf(
                    'Credit limit cannot be below current balance (MVR %.2f). Use override to force.',
                    $balance / 100,
                ));
            }

            $old = $this->eligibility->creditSummary($locked);
            $locked->update(['credit_limit_laar' => $limitLaar]);

            $this->audit->log(
                'customer.credit.limit_updated',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                ['override' => $override],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function updatePaymentTerms(
        Customer $customer,
        int $paymentTermsDays,
        User $actor,
        ?Request $request = null,
    ): Customer {
        if (!$customer->credit_enabled) {
            abort(422, 'Customer is not approved for credit.');
        }

        $termsDays = $this->eligibility->validatePaymentTermsDays($paymentTermsDays);

        return DB::transaction(function () use ($customer, $termsDays, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $old = $this->eligibility->creditSummary($locked);
            $locked->update(['credit_payment_terms_days' => $termsDays]);

            $this->audit->log(
                'customer.credit.terms_updated',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                ['payment_terms_days' => $termsDays],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function setReminderSms(
        Customer $customer,
        bool $enabled,
        User $actor,
        ?Request $request = null,
    ): Customer {
        if (!$customer->credit_enabled) {
            abort(422, 'Customer is not approved for credit.');
        }

        return DB::transaction(function () use ($customer, $enabled, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $old = $this->eligibility->creditSummary($locked);
            $locked->update(['credit_reminder_sms' => $enabled]);

            $this->audit->log(
                'customer.credit.reminder_sms_updated',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                ['credit_reminder_sms' => $enabled],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function updateCustomerReminderPreference(Customer $customer, bool $enabled): Customer
    {
        if (!$customer->credit_enabled) {
            abort(422, 'Credit account is not active.');
        }

        $customer->update(['credit_reminder_sms' => $enabled]);

        return $customer->fresh();
    }

    public function setStatus(
        Customer $customer,
        string $status,
        User $actor,
        ?Request $request = null,
    ): Customer {
        if (!in_array($status, ['active', 'on_hold', 'blocked'], true)) {
            abort(422, 'Invalid credit status.');
        }

        return DB::transaction(function () use ($customer, $status, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $old = $this->eligibility->creditSummary($locked);

            $updates = ['credit_status' => $status];
            if ($status === 'blocked') {
                $updates['credit_enabled'] = false;
            } elseif ($status === 'active' && $locked->credit_approved_by !== null) {
                $updates['credit_enabled'] = true;
            }

            $locked->update($updates);

            $this->audit->log(
                'customer.credit.status_updated',
                'Customer',
                $locked->id,
                $old,
                $this->eligibility->creditSummary($locked->fresh()),
                ['status' => $status],
                $request,
            );

            return $locked->fresh(['creditApprovedBy:id,name']);
        });
    }

    public function recordCharge(
        Customer $customer,
        Order $order,
        Payment $payment,
        User $actor,
        ?Request $request = null,
    ): CustomerCreditLedger {
        $existing = CustomerCreditLedger::where('payment_id', $payment->id)
            ->where('type', 'charge')
            ->first();
        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($customer, $order, $payment, $actor, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $amountLaar = (int) $payment->amount_laar;

            $this->eligibility->assertCanCharge($locked, $amountLaar);

            $newBalance = (int) $locked->credit_balance_laar + $amountLaar;
            $locked->update(['credit_balance_laar' => $newBalance]);

            $invoice = app(InvoiceController::class)->createFromOrderInternal($order, $actor);
            $termsDays = (int) ($locked->credit_payment_terms_days ?? CreditEligibilityService::DEFAULT_PAYMENT_TERMS_DAYS);
            $issueDate = $invoice->issue_date ?? now()->toDateString();
            $dueDate = \Illuminate\Support\Carbon::parse($issueDate)->addDays($termsDays)->toDateString();

            $invoice->update([
                'status' => 'sent',
                'due_date' => $dueDate,
                'paid_at' => null,
                'payment_method' => null,
                'payment_reference' => null,
                'amount_paid_laar' => 0,
                'notes' => trim(($invoice->notes ?? '') . ' Charged to customer credit account.'),
            ]);

            $ledger = CustomerCreditLedger::create([
                'customer_id' => $locked->id,
                'type' => 'charge',
                'amount_laar' => $amountLaar,
                'balance_after_laar' => $newBalance,
                'order_id' => $order->id,
                'invoice_id' => $invoice->id,
                'payment_id' => $payment->id,
                'shift_id' => $payment->shift_id,
                'method' => 'house_account',
                'recorded_by' => $actor->id,
                'notes' => 'POS credit charge for order ' . ($order->order_number ?? $order->id),
            ]);

            $this->audit->log(
                'customer.credit.charge',
                'Customer',
                $locked->id,
                [],
                [
                    'amount_laar' => $amountLaar,
                    'balance_after_laar' => $newBalance,
                    'order_id' => $order->id,
                    'invoice_id' => $invoice->id,
                    'payment_id' => $payment->id,
                ],
                [],
                $request,
            );

            return $ledger;
        });
    }

    /**
     * @param list<int>|null $invoiceIds
     */
    public function recordRepayment(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        ?array $invoiceIds = null,
        ?string $reference = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerCreditLedger {
        $allowedMethods = ['cash', 'card', 'bank_transfer'];
        if (!in_array($method, $allowedMethods, true)) {
            abort(422, 'Invalid repayment method.');
        }

        if ($amountLaar <= 0) {
            abort(422, 'Repayment amount must be greater than zero.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $method, $actor, $invoiceIds, $reference, $notes, $request) {
            $locked = Customer::lockForUpdate()->findOrFail($customer->id);
            $balance = (int) $locked->credit_balance_laar;

            if ($amountLaar > $balance) {
                abort(422, sprintf(
                    'Repayment exceeds outstanding balance (MVR %.2f).',
                    $balance / 100,
                ));
            }

            $shift = null;
            if ($method === 'cash') {
                $isOwner = $actor->role?->slug === 'owner';
                $shift = $this->shifts->findOpenShift($actor);
                if ($shift === null && !$isOwner) {
                    abort(422, 'Open a shift before recording a cash credit repayment.');
                }
            }

            $newBalance = $balance - $amountLaar;
            $locked->update(['credit_balance_laar' => $newBalance]);

            $this->applyRepaymentToInvoices($locked, $amountLaar, $method, $reference, $invoiceIds);

            if ($method === 'cash' && $shift !== null) {
                CashMovement::create([
                    'shift_id' => $shift->id,
                    'user_id' => $actor->id,
                    'type' => 'cash_in',
                    'amount' => round($amountLaar / 100, 2),
                    'reason' => 'Customer credit repayment — ' . ($locked->name ?? $locked->phone),
                ]);
            }

            $ledger = CustomerCreditLedger::create([
                'customer_id' => $locked->id,
                'type' => 'payment',
                'amount_laar' => -$amountLaar,
                'balance_after_laar' => $newBalance,
                'shift_id' => $shift?->id,
                'method' => $method,
                'recorded_by' => $actor->id,
                'notes' => $notes ?? $reference,
            ]);

            $this->audit->log(
                'customer.credit.repayment',
                'Customer',
                $locked->id,
                ['balance_laar' => $balance],
                [
                    'amount_laar' => $amountLaar,
                    'balance_after_laar' => $newBalance,
                    'method' => $method,
                    'reference' => $reference,
                ],
                ['ledger_id' => $ledger->id],
                $request,
            );

            return $ledger;
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openCreditInvoices(Customer $customer): array
    {
        return $this->openCreditInvoicesQuery($customer->id, null)
            ->get()
            ->map(fn (Invoice $inv) => [
                'id' => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'order_id' => $inv->order_id,
                'total_laar' => (int) $inv->total_laar,
                'amount_paid_laar' => (int) $inv->amount_paid_laar,
                'balance_due_laar' => $inv->balanceDueLaar(),
                'issue_date' => $inv->issue_date?->toDateString(),
                'due_date' => $inv->due_date?->toDateString(),
                'status' => $inv->status,
            ])
            ->values()
            ->all();
    }

    public function reverseChargeForRefund(Order $order, int $refundAmountLaar, User $actor, ?\App\Models\Refund $refund = null): void
    {
        if ($refund !== null && CustomerCreditLedger::where('refund_id', $refund->id)->where('type', 'refund_reversal')->exists()) {
            return;
        }

        $creditPaidLaar = (int) $order->payments()
            ->where('method', 'house_account')
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total')
            ->value('total');

        if ($creditPaidLaar <= 0 || !$order->customer_id) {
            return;
        }

        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $reversalLaar = $orderTotalLaar > 0
            ? (int) min($refundAmountLaar, (int) round($creditPaidLaar * ($refundAmountLaar / $orderTotalLaar)))
            : 0;

        if ($reversalLaar <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $reversalLaar, $actor, $refund) {
            $customer = Customer::lockForUpdate()->findOrFail((int) $order->customer_id);
            $newBalance = max(0, (int) $customer->credit_balance_laar - $reversalLaar);
            $customer->update(['credit_balance_laar' => $newBalance]);

            $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
            if ($invoice) {
                $newPaid = max(0, (int) $invoice->amount_paid_laar - $reversalLaar);
                $updates = ['amount_paid_laar' => $newPaid];
                if ($newPaid < (int) $invoice->total_laar && $invoice->status === 'paid') {
                    $updates['status'] = 'sent';
                    $updates['paid_at'] = null;
                    $updates['payment_method'] = null;
                    $updates['payment_reference'] = null;
                }
                $invoice->update($updates);
            }

            CustomerCreditLedger::create([
                'customer_id' => $customer->id,
                'type' => 'refund_reversal',
                'amount_laar' => -$reversalLaar,
                'balance_after_laar' => $newBalance,
                'order_id' => $order->id,
                'invoice_id' => $invoice?->id,
                'refund_id' => $refund?->id,
                'recorded_by' => $actor->id,
                'notes' => 'Credit reversal for refund on order ' . ($order->order_number ?? $order->id),
            ]);
        });
    }

    /**
     * @param list<int>|null $invoiceIds
     */
    private function applyRepaymentToInvoices(
        Customer $customer,
        int $amountLaar,
        string $method,
        ?string $reference,
        ?array $invoiceIds,
    ): void {
        $remaining = $amountLaar;

        /** @var Collection<int, Invoice> $invoices */
        $invoices = $this->openCreditInvoicesQuery($customer->id, $invoiceIds)->get();

        foreach ($invoices as $invoice) {
            if ($remaining <= 0) {
                break;
            }

            $due = $invoice->balanceDueLaar();
            if ($due <= 0) {
                continue;
            }

            $apply = min($remaining, $due);
            $newPaid = (int) $invoice->amount_paid_laar + $apply;
            $updates = ['amount_paid_laar' => $newPaid];

            if ($newPaid >= (int) $invoice->total_laar) {
                $updates['status'] = 'paid';
                $updates['paid_at'] = now();
                $updates['payment_method'] = $method;
                $updates['payment_reference'] = $reference;
            }

            $invoice->update($updates);
            $remaining -= $apply;
        }
    }

    /**
     * @param list<int>|null $invoiceIds
     */
    private function openCreditInvoicesQuery(int $customerId, ?array $invoiceIds)
    {
        $query = Invoice::query()
            ->where('customer_id', $customerId)
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw('total_laar > amount_paid_laar');

        if ($invoiceIds !== null && $invoiceIds !== []) {
            $query->whereIn('id', $invoiceIds)->orderBy('issue_date');
        } else {
            $query->orderBy('issue_date');
        }

        return $query;
    }
}
