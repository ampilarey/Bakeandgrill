<?php

declare(strict_types=1);

namespace App\Domains\Orders\Repositories;

use App\Models\Order;
use App\Services\OrderStatusTransitionService;

class EloquentOrderRepository implements OrderRepositoryInterface
{
    public function findById(int $id): ?Order
    {
        return Order::find($id);
    }

    /** @param string[] $relations */
    public function findWithRelations(int $id, array $relations): ?Order
    {
        return Order::with($relations)->find($id);
    }

    public function findByOrderNumber(string $orderNumber): ?Order
    {
        return Order::where('order_number', $orderNumber)->first();
    }

    /** @param array<string, mixed> $extra */
    public function updateStatus(int $id, string $status, array $extra = []): bool
    {
        $order = Order::find($id);
        if (! $order) {
            return false;
        }

        app(OrderStatusTransitionService::class)->transition($order, $status, $extra);

        return true;
    }
}
