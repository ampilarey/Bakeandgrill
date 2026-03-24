<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Repositories\CustomerRepositoryInterface;
use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
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

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(
        private LoyaltyLedgerService $service,
        private CustomerRepositoryInterface $customers,
        private OrderRepositoryInterface $orders,
    ) {}

    public function handle(OrderCompleted $event): void
    {
        $customerId = $event->data->customerId;

        if (!$customerId) {
            return;
        }

        $customer = $this->customers->findById($customerId);
        if (!$customer) {
            Log::warning('EarnPointsFromOrderListener: customer not found', ['customer_id' => $customerId]);

            return;
        }

        $order = $this->orders->findById($event->data->orderId);
        if (!$order) {
            Log::warning('EarnPointsFromOrderListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        try {
            $this->service->earnPointsForOrder($customer, $order);
        } catch (\Throwable $e) {
            Log::error('Failed to earn loyalty points', [
                'order_id'    => $event->data->orderId,
                'customer_id' => $customerId,
                'error'       => $e->getMessage(),
            ]);
            // Re-throw so the queue worker retries this job (respects $tries = 3).
            // Swallowing silently marks the job as succeeded → earned points are lost.
            throw $e;
        }
    }
}
