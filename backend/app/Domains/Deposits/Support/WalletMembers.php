<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Support;

use App\Models\Customer;
use App\Models\WalletMember;
use Illuminate\Support\Facades\DB;

/**
 * A family wallet (phase 4, owner 2026-10-21): a customer shares their
 * wallet with up to MAX_MEMBERS other customers, who pay from it when their
 * own wallet is empty, at the till and online. Money a member puts in goes
 * to their own wallet; only the owner puts money in the shared one or takes
 * it out, and a member's refund goes back to the wallet that paid.
 *
 * Who spends from which wallet is decided in one place,
 * DepositEligibilityService::spendingAccount(): the member's own wallet
 * while it has money, else the shared one. Holds for unpaid online orders
 * count against the wallet they draw on (DepositHolds::heldLaar reads the
 * owner's and the members' orders).
 */
final class WalletMembers
{
    public const MAX_MEMBERS = 4;

    /** The customer whose wallet this one may spend, when they are a member. */
    public static function ownerIdFor(int $customerId): ?int
    {
        $id = WalletMember::query()->where('member_customer_id', $customerId)->value('owner_customer_id');

        return $id === null ? null : (int) $id;
    }

    /** @return list<int> */
    public static function memberIdsOf(int $ownerId): array
    {
        return WalletMember::query()->where('owner_customer_id', $ownerId)->orderBy('id')->pluck('member_customer_id')->map(fn ($v) => (int) $v)->all();
    }

    /**
     * Everyone whose unpaid online orders draw on this customer's wallet:
     * the owner and their members. For a member, the household of their
     * owner.
     *
     * @return list<int>
     */
    public static function householdIds(int $customerId): array
    {
        $ownerId = self::ownerIdFor($customerId) ?? $customerId;

        return array_values(array_unique(array_merge([$ownerId], self::memberIdsOf($ownerId))));
    }

    /** Share the wallet with another customer, found by phone. */
    public static function add(Customer $owner, Customer $member): WalletMember
    {
        if ($member->id === $owner->id) {
            abort(422, 'That is your own number.');
        }
        if (!$member->is_active || (bool) $member->phone_unverified) {
            abort(422, 'That number does not have a checked Bake & Grill account yet. Ask them to sign in to the order app first.');
        }
        if (self::ownerIdFor($owner->id) !== null) {
            abort(422, 'You pay from a shared wallet yourself, so you cannot share one.');
        }
        if (self::memberIdsOf($member->id) !== []) {
            abort(422, 'That customer shares their own wallet with others, so they cannot join yours.');
        }
        $theirOwner = self::ownerIdFor($member->id);
        if ($theirOwner !== null) {
            abort(422, $theirOwner === $owner->id ? 'They already share your wallet.' : 'That customer already pays from someone else\'s wallet.');
        }

        return DB::transaction(function () use ($owner, $member): WalletMember {
            $count = WalletMember::query()->where('owner_customer_id', $owner->id)->lockForUpdate()->count();
            if ($count >= self::MAX_MEMBERS) {
                abort(422, sprintf('A wallet can be shared with %d people at most.', self::MAX_MEMBERS));
            }

            return WalletMember::create(['owner_customer_id' => $owner->id, 'member_customer_id' => $member->id]);
        });
    }

    /** The owner takes a member off, or a member leaves. */
    public static function remove(int $ownerId, int $memberId): bool
    {
        return WalletMember::query()->where('owner_customer_id', $ownerId)->where('member_customer_id', $memberId)->delete() > 0;
    }

    /** The owner's first name, for "Pay from Aisha's wallet". */
    public static function shortName(Customer $customer): string
    {
        $name = trim((string) $customer->name);
        if ($name === '') {
            return 'family';
        }

        return explode(' ', $name)[0];
    }
}
