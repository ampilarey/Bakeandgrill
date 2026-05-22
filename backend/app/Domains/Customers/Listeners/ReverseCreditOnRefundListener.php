<?php

declare(strict_types=1);

namespace App\Domains\Customers\Listeners;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Order;
use App\Models\Refund;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Reverse customer credit balance when a house_account order is refunded.
 */
class ReverseCreditOnRefundListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly CustomerCreditService $credit,
    ) {}

    public function handle(OrderRefunded $event): void
    {
        $refund = Refund::with('order')->find($event->data->refundId);
        if (!$refund?->order) {
            return;
        }

        /** @var Order $order */
        $order = $refund->order;
        $hasCredit = $order->payments()->where('method', 'house_account')->exists();
        if (!$hasCredit) {
            return;
        }

        $amountLaar = (int) round($event->data->amount * 100);
        $actor = $refund->user;
        if ($actor === null) {
            return;
        }

        $this->credit->reverseChargeForRefund($order, $amountLaar, $actor);
    }
}
