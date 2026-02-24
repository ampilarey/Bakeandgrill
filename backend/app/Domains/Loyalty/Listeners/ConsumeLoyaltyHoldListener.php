<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\LoyaltyHold;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Converts the loyalty hold into a consumed deduction when an order is paid.
 *
 * If the hold has expired but the customer paid, we still honor the discount
 * (log a warning, never fail a confirmed payment over a discount).
 *
 * Idempotent: protected by unique constraint on idempotency_key in loyalty_ledger.
 */
class ConsumeLoyaltyHoldListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function __construct(private LoyaltyLedgerService $service) {}

    public function handle(OrderPaid $event): void
    {
        $order = $event->order;

        $hold = LoyaltyHold::where('order_id', $order->id)
            ->whereIn('status', ['active', 'expired'])
            ->first();

        if (!$hold) {
            return;
        }

        try {
            $this->service->consumeHold($hold);
        } catch (\Throwable $e) {
            Log::error('Failed to consume loyalty hold', [
                'hold_id' => $hold->id,
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
