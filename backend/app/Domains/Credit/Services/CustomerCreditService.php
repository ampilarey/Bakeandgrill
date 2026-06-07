<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Facade preserving the original CustomerCreditService public API.
 */
class CustomerCreditService
{
    public const MIN_PAYMENT_TERMS_DAYS = CreditEligibilityService::MIN_PAYMENT_TERMS_DAYS;

    public const MAX_PAYMENT_TERMS_DAYS = CreditEligibilityService::MAX_PAYMENT_TERMS_DAYS;

    public const DEFAULT_PAYMENT_TERMS_DAYS = CreditEligibilityService::DEFAULT_PAYMENT_TERMS_DAYS;

    public function __construct(
        private readonly CreditEligibilityService $eligibility,
        private readonly CreditLedgerService $ledger,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function customerFacingSummary(Customer $customer): array
    {
        return $this->eligibility->customerFacingSummary($customer);
    }

    public function validatePaymentTermsDays(int $days): int
    {
        return $this->eligibility->validatePaymentTermsDays($days);
    }

    /**
     * @return array<string, mixed>
     */
    public function creditSummary(Customer $customer): array
    {
        return $this->eligibility->creditSummary($customer);
    }

    public function nextPaymentDueDate(Customer $customer): ?string
    {
        return $this->eligibility->nextPaymentDueDate($customer);
    }

    public function availableCreditLaar(Customer $customer): int
    {
        return $this->eligibility->availableCreditLaar($customer);
    }

    public function canCharge(Customer $customer): bool
    {
        return $this->eligibility->canCharge($customer);
    }

    public function assertCanCharge(Customer $customer, int $amountLaar): void
    {
        $this->eligibility->assertCanCharge($customer, $amountLaar);
    }

    public function approveCredit(
        Customer $customer,
        int $limitLaar,
        User $actor,
        ?string $notes = null,
        ?Request $request = null,
        ?int $paymentTermsDays = null,
    ): Customer {
        return $this->ledger->approveCredit($customer, $limitLaar, $actor, $notes, $request, $paymentTermsDays);
    }

    public function disableCredit(Customer $customer, User $actor, ?Request $request = null): Customer
    {
        return $this->ledger->disableCredit($customer, $actor, $request);
    }

    public function updateLimit(
        Customer $customer,
        int $limitLaar,
        User $actor,
        bool $override = false,
        ?Request $request = null,
    ): Customer {
        return $this->ledger->updateLimit($customer, $limitLaar, $actor, $override, $request);
    }

    public function updatePaymentTerms(
        Customer $customer,
        int $paymentTermsDays,
        User $actor,
        ?Request $request = null,
    ): Customer {
        return $this->ledger->updatePaymentTerms($customer, $paymentTermsDays, $actor, $request);
    }

    public function setReminderSms(
        Customer $customer,
        bool $enabled,
        User $actor,
        ?Request $request = null,
    ): Customer {
        return $this->ledger->setReminderSms($customer, $enabled, $actor, $request);
    }

    public function updateCustomerReminderPreference(Customer $customer, bool $enabled): Customer
    {
        return $this->ledger->updateCustomerReminderPreference($customer, $enabled);
    }

    public function setStatus(
        Customer $customer,
        string $status,
        User $actor,
        ?Request $request = null,
    ): Customer {
        return $this->ledger->setStatus($customer, $status, $actor, $request);
    }

    public function recordCharge(
        Customer $customer,
        Order $order,
        Payment $payment,
        User $actor,
        ?Request $request = null,
    ): CustomerCreditLedger {
        return $this->ledger->recordCharge($customer, $order, $payment, $actor, $request);
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
        return $this->ledger->recordRepayment(
            $customer,
            $amountLaar,
            $method,
            $actor,
            $invoiceIds,
            $reference,
            $notes,
            $request,
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openCreditInvoices(Customer $customer): array
    {
        return $this->ledger->openCreditInvoices($customer);
    }

    public function reverseChargeForRefund(Order $order, int $refundAmountLaar, User $actor): void
    {
        $this->ledger->reverseChargeForRefund($order, $refundAmountLaar, $actor);
    }
}
