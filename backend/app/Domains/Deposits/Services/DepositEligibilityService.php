<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Domains\Deposits\Support\DepositHolds;
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
            // Part of an unpaid online order is on hold (DepositHolds, 2026-10-21).
            'held_mvr' => round($summary['held_laar'] / 100, 2),
            'available_mvr' => round($summary['available_laar'] / 100, 2),
            // The customer's own choice: the wallet first at checkout.
            'wallet_first' => (bool) $customer->wallet_first,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function depositSummary(Customer $customer, ?CustomerDepositAccount $account = null): array
    {
        $account ??= CustomerDepositAccount::where('customer_id', $customer->id)->first();
        $balanceLaar = (int) ($account?->balance_laar ?? 0);
        $heldLaar = $account !== null ? DepositHolds::heldLaar($customer->id) : 0;
        $status = $account?->status ?? 'active';
        $canUse = $this->canUseDeposit($customer, 1, $account);

        return [
            'has_account' => $account !== null,
            'status' => $status,
            'balance_laar' => $balanceLaar,
            'held_laar' => $heldLaar,
            'available_laar' => max(0, $balanceLaar - $heldLaar),
            'can_use' => $canUse,
            'wallet_first' => (bool) $customer->wallet_first,
            'notes' => $account?->notes,
        ];
    }

    /** Money on hold for an unpaid online order (DepositHolds) is not available to anything else. */
    public function canUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null, ?int $excludePaymentId = null): bool
    {
        if ($amountLaar <= 0) {
            return false;
        }

        $account ??= CustomerDepositAccount::where('customer_id', $customer->id)->first();
        if ($account === null || $account->status !== 'active') {
            return false;
        }

        return (int) $account->balance_laar - DepositHolds::heldLaar($customer->id, $excludePaymentId) >= $amountLaar;
    }

    /** @param int|null $excludePaymentId The hold being taken now, which must not count against itself. */
    public function assertCanUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null, ?int $excludePaymentId = null): void
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

        if ($amountLaar > (int) $account->balance_laar - DepositHolds::heldLaar($customer->id, $excludePaymentId)) {
            abort(422, 'Deposit amount exceeds available prepaid balance.');
        }
    }
}
