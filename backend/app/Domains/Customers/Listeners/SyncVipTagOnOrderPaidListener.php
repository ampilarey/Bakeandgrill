<?php

declare(strict_types=1);

namespace App\Domains\Customers\Listeners;

use App\Domains\Customers\Services\VipTagSyncService;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Customer;
use Illuminate\Support\Facades\Log;

final class SyncVipTagOnOrderPaidListener
{
    public function __construct(
        private readonly VipTagSyncService $sync,
    ) {}

    public function handle(OrderPaid $event): void
    {
        $customerId = $event->data->customerId;
        if (!$customerId) {
            return;
        }

        try {
            $customer = Customer::find($customerId);
            if (!$customer) {
                return;
            }

            $this->sync->syncCustomer($customer);
        } catch (\Throwable $e) {
            Log::warning('SyncVipTagOnOrderPaidListener failed', [
                'customer_id' => $customerId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
