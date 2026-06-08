<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Listeners;

use App\Domains\Deposits\Services\CustomerDepositService;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Order;
use App\Models\Refund;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Restore customer deposit balance when a wallet-paid order is refunded.
 */
class ReverseDepositOnRefundListener implements ShouldQueue
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
        $actor = $refund->user;
        if ($actor === null) {
            return;
        }

        $this->deposits->reverseUsageForOrderRefund($order, $amountLaar, $refund, $actor);
    }
}
