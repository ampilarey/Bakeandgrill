<?php

declare(strict_types=1);

namespace App\Domains\Orders\Repositories;

use App\Models\Order;

interface OrderRepositoryInterface
{
    public function findById(int $id): ?Order;

    /** @param string[] $relations */
    public function findWithRelations(int $id, array $relations): ?Order;

    public function findByOrderNumber(string $orderNumber): ?Order;

    /** @param array<string, mixed> $extra */
    public function updateStatus(int $id, string $status, array $extra = []): bool;
}
