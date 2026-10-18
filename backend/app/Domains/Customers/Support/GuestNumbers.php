<?php

declare(strict_types=1);

namespace App\Domains\Customers\Support;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Loyalty\Services\PointsCalculator;
use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Numbers typed at guest checkout and never checked with a code (owner, 2026-10-18:
 * "he might enter someone else's number by mistake").
 *
 * A guest account is `phone_unverified`. Its holder verifies from their own session
 * (`claim()`): the history is theirs, and the points held back while the number was
 * unchecked are added. When somebody else proves the number with a code instead,
 * the guest account is set aside (`setAside()`): it keeps its orders, addresses and
 * points for staff to see, with the typed number in `unverified_phone`, and the
 * number's owner starts on a clean account, so they never see a stranger's address.
 */
final class GuestNumbers
{
    public const SETTING = 'guest_checkout_enabled';

    public const VERIFY_PURPOSE = 'verify_phone';

    public static function guestCheckoutOn(): bool
    {
        $v = SiteSetting::get(self::SETTING, '1');

        return !in_array(strtolower((string) $v), ['0', 'false', 'off', ''], true);
    }

    /** Completed orders whose points were held back while the number was unchecked. */
    public static function heldOrders(Customer $customer): Collection
    {
        if (!$customer->phone_unverified) {
            return collect();
        }
        $earned = LoyaltyLedger::query()->where('customer_id', $customer->id)->where('type', 'earn')->pluck('order_id')->filter()->all();

        return Order::query()
            ->where('customer_id', $customer->id)
            ->where('status', 'completed')
            ->where('type', '!=', 'gift_card')
            ->whereNotIn('id', $earned)
            ->get();
    }

    /** The points the held orders would bring, as the program counts them now. */
    public static function heldPoints(Customer $customer): int
    {
        $orders = self::heldOrders($customer);
        if ($orders->isEmpty()) {
            return 0;
        }
        $calc = app(PointsCalculator::class);

        return (int) $orders->sum(fn (Order $o) => $calc->pointsForOrder($o));
    }

    /**
     * The holder proved the number from their own session: the account and its
     * history are theirs. Returns the points added.
     */
    public static function claim(Customer $customer): int
    {
        if (!$customer->phone_unverified) {
            return 0;
        }
        $held = self::heldOrders($customer);
        $customer->forceFill(['phone_unverified' => false, 'phone_verified_at' => now()])->save();

        $ledger = app(LoyaltyLedgerService::class);
        foreach ($held as $order) {
            $ledger->earnPointsForOrder($customer, $order);
        }

        return (int) LoyaltyLedger::query()
            ->where('customer_id', $customer->id)
            ->where('type', 'earn')
            ->whereIn('order_id', $held->pluck('id'))
            ->sum('points');
    }

    /**
     * Somebody proved this number who is not the guest who typed it. The guest
     * account steps aside with everything on it; the owner gets a fresh account.
     */
    public static function setAside(Customer $guest): Customer
    {
        return DB::transaction(function () use ($guest): Customer {
            $guest = Customer::query()->lockForUpdate()->findOrFail($guest->id);
            $phone = (string) $guest->phone;

            $guest->forceFill([
                'unverified_phone' => $phone,
                'phone' => 'unverified-' . $guest->id,
                'is_active' => false,
                'set_aside_at' => now(),
            ])->save();

            $owner = Customer::create([
                'phone' => $phone,
                'loyalty_points' => 0,
                'tier' => 'bronze',
                'is_active' => true,
            ]);
            $owner->forceFill(['phone_verified_at' => now()])->save();
            $guest->forceFill(['set_aside_for_customer_id' => $owner->id])->save();

            return $owner;
        });
    }
}
