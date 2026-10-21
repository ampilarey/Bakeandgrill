<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Deposits\Services\DepositEligibilityService;
use App\Domains\Deposits\Services\DepositNotifier;
use App\Domains\Deposits\Support\WalletMembers;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The family wallet in the order app (phase 4, owner 2026-10-21): who a
 * customer shares their wallet with, adding one by phone, taking one off,
 * and leaving a wallet shared with you.
 */
class CustomerWalletMembersController extends Controller
{
    /** GET /api/customer/wallet/members */
    public function index(Request $request): JsonResponse
    {
        return response()->json($this->state($this->customer($request)));
    }

    /** POST /api/customer/wallet/members {phone}: share the wallet with the customer on that number. */
    public function store(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $validated = $request->validate(['phone' => ['required', 'string', 'max:32']]);
        $digits = preg_replace('/\D+/', '', (string) $validated['phone']);
        $last7 = substr($digits, -7);
        if (strlen($last7) !== 7) {
            abort(422, 'Enter a Maldives mobile number.');
        }
        $member = Customer::query()
            ->where('phone', 'like', '%' . $last7)
            ->where('is_active', true)
            ->orderBy('id')
            ->first();
        if ($member === null) {
            abort(422, 'That number does not have a Bake & Grill account yet. Ask them to sign in to the order app first.');
        }

        WalletMembers::add($customer, $member);
        app(DepositNotifier::class)->shared($member, $customer);

        return response()->json(array_merge($this->state($customer), ['message' => 'Your wallet is now shared with ' . ($member->name ?: $member->phone) . '.']));
    }

    /** DELETE /api/customer/wallet/members/{memberId}: the owner takes someone off. */
    public function destroy(Request $request, int $memberId): JsonResponse
    {
        $customer = $this->customer($request);
        if (!WalletMembers::remove($customer->id, $memberId)) {
            abort(404, 'They do not share your wallet.');
        }

        return response()->json($this->state($customer));
    }

    /** DELETE /api/customer/wallet/members/leave: stop paying from a wallet shared with you. */
    public function leave(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $ownerId = WalletMembers::ownerIdFor($customer->id);
        if ($ownerId !== null) {
            WalletMembers::remove($ownerId, $customer->id);
        }

        return response()->json($this->state($customer));
    }

    /** @return array<string, mixed> */
    private function state(Customer $customer): array
    {
        $summary = app(DepositEligibilityService::class)->depositSummary($customer, CustomerDepositAccount::where('customer_id', $customer->id)->first());
        $ownerId = WalletMembers::ownerIdFor($customer->id);
        $owner = $ownerId !== null ? Customer::query()->find($ownerId) : null;
        $ownerAccount = $owner !== null ? CustomerDepositAccount::where('customer_id', $owner->id)->first() : null;

        return [
            'members' => array_map(fn (array $m) => [
                'id' => $m['id'],
                'name' => $m['name'],
                'phone' => self::maskPhone($m['phone']),
            ], $summary['shared_with']),
            'max' => WalletMembers::MAX_MEMBERS,
            'shares_wallet_of' => $owner === null ? null : [
                'name' => WalletMembers::shortName($owner),
                'balance_mvr' => round((int) ($ownerAccount?->balance_laar ?? 0) / 100, 2),
                'active' => ($ownerAccount?->status ?? 'active') === 'active',
            ],
        ];
    }

    private static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone);

        return strlen($digits) >= 4 ? '•••' . substr($digits, -4) : $phone;
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }
}
