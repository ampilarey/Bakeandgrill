<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Http\Request;

final class CustomerDepositService
{
    public function __construct(
        private readonly DepositEligibilityService $eligibility,
        private readonly DepositLedgerService $ledger,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function customerFacingSummary(Customer $customer): array
    {
        return $this->eligibility->customerFacingSummary($customer);
    }

    /**
     * @return array<string, mixed>
     */
    public function depositSummary(Customer $customer, ?CustomerDepositAccount $account = null): array
    {
        return $this->eligibility->depositSummary($customer, $account);
    }

    public function canUseDeposit(Customer $customer, int $amountLaar): bool
    {
        return $this->eligibility->canUseDeposit($customer, $amountLaar);
    }

    public function assertCanUseDeposit(Customer $customer, int $amountLaar): void
    {
        $this->eligibility->assertCanUseDeposit($customer, $amountLaar);
    }

    public function getOrCreateAccount(Customer $customer, ?User $actor = null): CustomerDepositAccount
    {
        return $this->ledger->getOrCreateAccount($customer, $actor);
    }

    public function topUp(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        ?string $reference = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        return $this->ledger->topUp($customer, $amountLaar, $method, $actor, $reference, $notes, $request);
    }

    public function adjust(
        Customer $customer,
        int $amountLaar,
        User $actor,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        return $this->ledger->adjust($customer, $amountLaar, $actor, $notes, $request);
    }

    public function setStatus(
        Customer $customer,
        string $status,
        User $actor,
        ?Request $request = null,
    ): CustomerDepositAccount {
        return $this->ledger->setStatus($customer, $status, $actor, $request);
    }

    public function recordUsage(
        Customer $customer,
        Order $order,
        Payment $payment,
        User $actor,
        ?Request $request = null,
    ): ?CustomerDepositLedger {
        return $this->ledger->recordUsage($customer, $order, $payment, $actor, $request);
    }

    public function refundToDeposit(
        Customer $customer,
        int $amountLaar,
        User $actor,
        ?Order $order = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        return $this->ledger->refundToDeposit($customer, $amountLaar, $actor, $order, $notes, $request);
    }
}
