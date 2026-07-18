<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Listeners;

use App\Domains\Deposits\Services\CustomerDepositService;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Order;
use App\Models\Refund;
use App\Models\User;

/**
 * Restore customer deposit balance when a wallet-paid order is refunded.
 *
 * Synchronous after commit so wallet restores even if the queue worker is down.
 */
class ReverseDepositOnRefundListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly CustomerDepositService $deposits,
    ) {}

    public function handle(OrderRefunded $event): void
    {
        $refund = Refund::with('order')->find($event->data->refundId);
        if (!$refund?->order) {
            return;
        }

        /** @var Order $order */
        $order = $refund->order;
        $hasWallet = $order->payments()->where('method', 'wallet')->exists();
        if (!$hasWallet) {
            return;
        }

        $amountLaar = (int) round($event->data->amount * 100);
        $actor = $this->resolveRefundActor($refund, $order);
        if ($actor === null) {
            return;
        }

        $this->deposits->reverseUsageForOrderRefund($order, $amountLaar, $refund, $actor);
    }

    private function resolveRefundActor(Refund $refund, Order $order): ?User
    {
        if ($refund->user !== null) {
            return $refund->user;
        }

        if ($order->user_id) {
            $orderStaff = User::find($order->user_id);
            if ($orderStaff !== null) {
                return $orderStaff;
            }
        }

        return User::query()
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->where('is_active', true)
            ->orderBy('id')
            ->first();
    }
}
