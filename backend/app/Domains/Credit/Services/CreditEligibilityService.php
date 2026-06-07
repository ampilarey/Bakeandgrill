<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\Customer;
use App\Models\Invoice;

final class CreditEligibilityService
{
    public const MIN_PAYMENT_TERMS_DAYS = 7;

    public const MAX_PAYMENT_TERMS_DAYS = 90;

    public const DEFAULT_PAYMENT_TERMS_DAYS = 30;

    public function validatePaymentTermsDays(int $days): int
    {
        if ($days < self::MIN_PAYMENT_TERMS_DAYS || $days > self::MAX_PAYMENT_TERMS_DAYS) {
            abort(422, sprintf(
                'Payment terms must be between %d and %d days.',
                self::MIN_PAYMENT_TERMS_DAYS,
                self::MAX_PAYMENT_TERMS_DAYS,
            ));
        }

        return $days;
    }

    /**
     * @return array<string, mixed>
     */
    public function customerFacingSummary(Customer $customer): array
    {
        $summary = $this->creditSummary($customer);

        return [
            'enabled' => (bool) $summary['enabled'],
            'status' => $summary['status'],
            'limit_mvr' => round($summary['limit_laar'] / 100, 2),
            'balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'available_mvr' => round($summary['available_laar'] / 100, 2),
            'payment_terms_days' => (int) $summary['payment_terms_days'],
            'reminder_sms_enabled' => (bool) $summary['reminder_sms_enabled'],
            'next_payment_due_date' => $summary['next_payment_due_date'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function creditSummary(Customer $customer): array
    {
        $available = $this->availableCreditLaar($customer);
        $canCharge = $this->canCharge($customer);
        $nextDue = $this->nextPaymentDueDate($customer);

        return [
            'enabled' => (bool) $customer->credit_enabled,
            'status' => $customer->credit_status ?? 'blocked',
            'limit_laar' => (int) ($customer->credit_limit_laar ?? 0),
            'balance_laar' => (int) ($customer->credit_balance_laar ?? 0),
            'available_laar' => $available,
            'can_charge' => $canCharge,
            'credit_notes' => $customer->credit_notes,
            'approved_by' => $customer->credit_approved_by,
            'approved_at' => $customer->credit_approved_at?->toIso8601String(),
            'payment_terms_days' => (int) ($customer->credit_payment_terms_days ?? self::DEFAULT_PAYMENT_TERMS_DAYS),
            'reminder_sms_enabled' => (bool) ($customer->credit_reminder_sms ?? true),
            'next_payment_due_date' => $nextDue,
        ];
    }

    public function nextPaymentDueDate(Customer $customer): ?string
    {
        if (!$customer->credit_enabled || (int) $customer->credit_balance_laar <= 0) {
            return null;
        }

        $due = Invoice::query()
            ->where('customer_id', $customer->id)
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw('total_laar > amount_paid_laar')
            ->whereNotNull('due_date')
            ->orderBy('due_date')
            ->value('due_date');

        if ($due === null) {
            return null;
        }

        return $due instanceof \DateTimeInterface
            ? $due->format('Y-m-d')
            : (string) $due;
    }

    public function availableCreditLaar(Customer $customer): int
    {
        if (!$customer->credit_enabled || $customer->credit_status !== 'active') {
            return 0;
        }

        return max(0, (int) $customer->credit_limit_laar - (int) $customer->credit_balance_laar);
    }

    public function canCharge(Customer $customer): bool
    {
        return $customer->credit_enabled
            && $customer->credit_status === 'active'
            && $this->availableCreditLaar($customer) > 0;
    }

    /**
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException
     */
    public function assertCanCharge(Customer $customer, int $amountLaar): void
    {
        if (!$customer->credit_enabled) {
            abort(422, 'This customer is not approved for credit.');
        }

        if ($customer->credit_status === 'on_hold') {
            abort(422, 'This customer credit account is on hold.');
        }

        if ($customer->credit_status === 'blocked') {
            abort(422, 'This customer credit account is blocked.');
        }

        if ($customer->credit_status !== 'active') {
            abort(422, 'This customer is not approved for credit.');
        }

        if ($amountLaar <= 0) {
            abort(422, 'Credit amount must be greater than zero.');
        }

        if ($amountLaar > $this->availableCreditLaar($customer)) {
            abort(422, 'Credit amount exceeds available credit limit.');
        }
    }
}
