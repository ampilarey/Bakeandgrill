<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderCompleted;
use App\Models\Customer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Awards loyalty points to the customer when an order is fully completed.
 * Idempotent: unique (idempotency_key) on loyalty_ledger.
 */
class EarnPointsFromOrderListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function __construct(private LoyaltyLedgerService $service) {}

    public function handle(OrderCompleted $event): void
    {
        $order = $event->order;

        if (!$order->customer_id) {
            return;
        }

        $customer = Customer::find($order->customer_id);
        if (!$customer) {
            Log::warning('EarnPointsFromOrderListener: customer not found', ['customer_id' => $order->customer_id]);

            return;
        }

        try {
            $this->service->earnPointsForOrder($customer, $order);
        } catch (\Throwable $e) {
            Log::error('Failed to earn loyalty points', [
                'order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
