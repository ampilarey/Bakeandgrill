<?php

declare(strict_types=1);

namespace App\Domains\Payments\Repositories;

use App\Models\Payment;

interface PaymentRepositoryInterface
{
    public function findById(int $id): ?Payment;

    public function findByLocalId(string $localId): ?Payment;

    public function findByOrderId(int $orderId): ?Payment;

    public function findByIdempotencyKey(string $key): ?Payment;

    /** @param array<string, mixed> $data */
    public function create(array $data): Payment;

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): bool;

    /**
     * @param array<string, mixed> $match
     * @param array<string, mixed> $values
     */
    public function firstOrCreate(array $match, array $values): Payment;

    /** @param string[] $statuses */
    public function sumAmountForOrder(int $orderId, array $statuses): float;

    /** @param string[] $statuses */
    public function sumAmountLaarForOrder(int $orderId, array $statuses): int;
}
