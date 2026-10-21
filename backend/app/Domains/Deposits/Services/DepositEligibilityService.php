<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Domains\Deposits\Support\DepositHolds;
use App\Domains\Deposits\Support\WalletMembers;
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
            // The family wallet (phase 4): whose wallet this is when it is not
            // their own, who shares theirs with them, and who they share with.
            'shared_from' => $summary['shared_from'],
            'shares_wallet_of' => $summary['shares_wallet_of'],
            'shared_with' => $summary['shared_with'],
        ];
    }

    /**
     * Whose wallet this customer spends from (phase 4, the family wallet):
     * their own while it has money and is active, else the one shared with
     * them, else their own (which may not exist).
     *
     * @return array{account: ?CustomerDepositAccount, owner: Customer}
     */
    public function spendingAccount(Customer $customer): array
    {
        $own = CustomerDepositAccount::where('customer_id', $customer->id)->first();
        if ($own !== null && $own->status === 'active' && (int) $own->balance_laar > 0) {
            return ['account' => $own, 'owner' => $customer];
        }
        $ownerId = WalletMembers::ownerIdFor($customer->id);
        if ($ownerId !== null) {
            $owner = Customer::query()->find($ownerId);
            $shared = $owner !== null ? CustomerDepositAccount::where('customer_id', $ownerId)->first() : null;
            if ($owner !== null && $shared !== null && $shared->status === 'active') {
                return ['account' => $shared, 'owner' => $owner];
            }
        }

        return ['account' => $own, 'owner' => $customer];
    }

    /**
     * @param CustomerDepositAccount|null $account the customer's own account when the caller holds it; left out, the wallet they spend from
     * @return array<string, mixed>
     */
    public function depositSummary(Customer $customer, ?CustomerDepositAccount $account = null): array
    {
        $owner = $customer;
        if ($account === null) {
            ['account' => $account, 'owner' => $owner] = $this->spendingAccount($customer);
        }
        $balanceLaar = (int) ($account?->balance_laar ?? 0);
        $heldLaar = $account !== null ? DepositHolds::heldLaar((int) $account->customer_id) : 0;
        $status = $account?->status ?? 'active';
        $canUse = $this->canUseDeposit($customer, 1, $account);

        $sharesWalletOf = null;
        $sharedOwnerId = WalletMembers::ownerIdFor($customer->id);
        if ($sharedOwnerId !== null) {
            $sharedOwner = Customer::query()->find($sharedOwnerId);
            $sharesWalletOf = $sharedOwner !== null ? WalletMembers::shortName($sharedOwner) : null;
        }
        $memberIds = WalletMembers::memberIdsOf($customer->id);
        $sharedWith = $memberIds === [] ? [] : Customer::query()->whereIn('id', $memberIds)->orderBy('id')->get()
            ->map(fn (Customer $m) => ['id' => $m->id, 'name' => (string) ($m->name ?: $m->phone), 'phone' => (string) $m->phone])
            ->values()->all();

        return [
            'has_account' => $account !== null,
            'status' => $status,
            'balance_laar' => $balanceLaar,
            'held_laar' => $heldLaar,
            'available_laar' => max(0, $balanceLaar - $heldLaar),
            'can_use' => $canUse,
            'wallet_first' => (bool) $customer->wallet_first,
            'notes' => $account?->notes,
            // The family wallet (phase 4).
            'account_customer_id' => $account !== null ? (int) $account->customer_id : $customer->id,
            'shared_from' => $owner->id !== $customer->id ? WalletMembers::shortName($owner) : null,
            'shares_wallet_of' => $sharesWalletOf,
            'shared_with' => $sharedWith,
        ];
    }

    /**
     * Money on hold for an unpaid online order (DepositHolds) is not available
     * to anything else. Holds count against the wallet they draw on, so they
     * are read for the account's owner, not the customer asking.
     */
    public function canUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null, ?int $excludePaymentId = null): bool
    {
        if ($amountLaar <= 0) {
            return false;
        }

        if ($account === null) {
            ['account' => $account] = $this->spendingAccount($customer);
        }
        if ($account === null || $account->status !== 'active') {
            return false;
        }

        return (int) $account->balance_laar - DepositHolds::heldLaar((int) $account->customer_id, $excludePaymentId) >= $amountLaar;
    }

    /** @param int|null $excludePaymentId The hold being taken now, which must not count against itself. */
    public function assertCanUseDeposit(Customer $customer, int $amountLaar, ?CustomerDepositAccount $account = null, ?int $excludePaymentId = null): void
    {
        if ($account === null) {
            ['account' => $account] = $this->spendingAccount($customer);
        }

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

        if ($amountLaar > (int) $account->balance_laar - DepositHolds::heldLaar((int) $account->customer_id, $excludePaymentId)) {
            abort(422, 'Deposit amount exceeds available prepaid balance.');
        }
    }
}
