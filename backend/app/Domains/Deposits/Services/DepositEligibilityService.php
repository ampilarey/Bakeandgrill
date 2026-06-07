<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Models\Customer;
use App\Models\CustomerDepositAccount;

final class DepositEligibilityService
{
    /**
     * @return array<string, mixed>
     */
    public function customerFacingSummary(Customer $customer, ?CustomerDepositAccount $account = null): array
    {
        $summary = $this->depositSummary($customer, $account);

        return [
            'balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'status' => $summary['status'],
            'can_use' => $summary['can_use'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function depositSummary(Customer $customer, ?CustomerDepositAccount $account = null): array
    {
        $account ??= CustomerDepositAccount::where('customer_id', $customer->id)->first();
        $balanceLaar = (int) ($account?->balance_laar ?? 0);
        $status = $account?->status ?? 'active';
        $canUse = $this->canUseDeposit($customer, 1, $account);

        return [
            'has_account' => $account !== null,
            'status' => $status,
            'balance_laar' => $balanceLaar,
            'can_use' => $canUse,
            'notes' => $account?->notes,
        ];
    }

    public function canUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null): bool
    {
        if ($amountLaar <= 0) {
            return false;
        }

        $account ??= CustomerDepositAccount::where('customer_id', $customer->id)->first();
        if ($account === null || $account->status !== 'active') {
            return false;
        }

        return (int) $account->balance_laar >= $amountLaar;
    }

    public function assertCanUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null): void
    {
        $account ??= CustomerDepositAccount::where('customer_id', $customer->id)->first();

        if ($account === null) {
            abort(422, 'This customer has no prepaid deposit balance.');
        }

        if ($account->status === 'frozen') {
            abort(422, 'This customer deposit account is frozen.');
        }

        if ($account->status === 'closed') {
            abort(422, 'This customer deposit account is closed.');
        }

        if ($amountLaar <= 0) {
            abort(422, 'Deposit amount must be greater than zero.');
        }

        if ($amountLaar > (int) $account->balance_laar) {
            abort(422, 'Deposit amount exceeds available prepaid balance.');
        }
    }
}
