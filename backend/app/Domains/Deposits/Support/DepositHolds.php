<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Support;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Part of an online order paid from the wallet (owner, 2026-10-21): the
 * wallet never covered a bigger order, and taking the money before the card
 * paid the rest would strand it on an order the bank then refused.
 *
 * A hold is a pending Payment row (method customer_deposit) on the order:
 * nothing leaves the wallet, but the held amount is not available to
 * anything else (DepositEligibilityService) and the card session is opened
 * for what is left (PaymentService::getRemainingBalanceLaar). When the bank
 * confirms the card, settle() takes the held money through the usual usage
 * ledger, in the same transaction; a cancelled order releases it.
 */
final class DepositHolds
{
    public const METHOD = 'customer_deposit';

    /** A hold older than this is not a hold any more: the order is stale by then. */
    public const LOOKBACK_HOURS = 48;

    /**
     * What this wallet's unpaid orders have on hold, so it is not spent
     * twice: the owner's orders and, for a family wallet (phase 4), the
     * orders of everyone they share it with.
     */
    public static function heldLaar(int $customerId, ?int $excludePaymentId = null): int
    {
        $customerIds = array_values(array_unique(array_merge([$customerId], WalletMembers::memberIdsOf($customerId))));
        $query = Payment::query()
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->whereIn('orders.customer_id', $customerIds)
            ->where('orders.status', 'payment_pending')
            ->where('payments.method', self::METHOD)
            ->where('payments.status', 'pending')
            ->where('payments.created_at', '>=', now()->subHours(self::LOOKBACK_HOURS));
        if ($excludePaymentId !== null) {
            $query->where('payments.id', '!=', $excludePaymentId);
        }

        return (int) $query->sum('payments.amount_laar');
    }

    /** The pending holds on one order, in laari. */
    public static function heldOnOrderLaar(Order $order): int
    {
        return (int) self::pendingOnOrder($order)->sum('amount_laar');
    }

    /** @return Collection<int, Payment> */
    public static function pendingOnOrder(Order $order): Collection
    {
        return Payment::query()
            ->where('order_id', $order->id)
            ->where('method', self::METHOD)
            ->where('status', 'pending')
            ->orderBy('id')
            ->get();
    }

    /**
     * Put part of the wallet on hold for this order. One hold per order: a
     * second call moves it to the new amount.
     */
    public static function hold(Customer $customer, Order $order, int $amountLaar): Payment
    {
        $existing = self::pendingOnOrder($order)->first();
        if ($existing !== null) {
            $existing->update(['amount' => round($amountLaar / 100, 2), 'amount_laar' => $amountLaar]);

            return $existing->fresh();
        }

        return Payment::create([
            'order_id' => $order->id,
            'method' => self::METHOD,
            'amount' => round($amountLaar / 100, 2),
            'amount_laar' => $amountLaar,
            'status' => 'pending',
            'idempotency_key' => 'wallet-hold:' . $order->id . ':' . $customer->id,
        ]);
    }

    /**
     * The card paid the rest: take the held money now, inside the confirm
     * transaction. A hold the wallet can no longer cover (frozen, emptied at
     * the counter meanwhile) is marked failed and logged; the order then
     * shows the shortfall as a partial payment.
     *
     * @param User|null $actor who the ledger names; the owner (WalletActor) when
     *                         not given, looked up only once there is a hold, so
     *                         an ordinary card payment never needs one
     * @return int laari taken from the wallet
     */
    public static function settle(Order $order, DepositLedgerService $ledger, ?User $actor = null): int
    {
        $holds = self::pendingOnOrder($order);
        if ($holds->isEmpty()) {
            return 0;
        }
        $actor ??= WalletActor::system();
        $customer = $order->customer_id !== null ? Customer::query()->find($order->customer_id) : null;
        $taken = 0;
        foreach ($holds as $hold) {
            if ($customer === null) {
                $hold->update(['status' => 'failed', 'gateway_response' => ['error' => 'no customer on the order']]);

                continue;
            }
            try {
                $ledger->recordUsage($customer, $order, $hold, $actor);
                $hold->update(['status' => 'paid', 'processed_at' => now()]);
                $taken += (int) $hold->amount_laar;
            } catch (\Throwable $e) {
                Log::error('wallet hold could not be taken', ['order_id' => $order->id, 'payment_id' => $hold->id, 'error' => $e->getMessage()]);
                $hold->update(['status' => 'failed', 'gateway_response' => ['error' => $e->getMessage()]]);
            }
        }

        return $taken;
    }

    /** The order is not going ahead: the held money is free again. */
    public static function release(Order $order): int
    {
        $n = 0;
        foreach (self::pendingOnOrder($order) as $hold) {
            $hold->update(['status' => 'cancelled']);
            $n++;
        }

        return $n;
    }
}
