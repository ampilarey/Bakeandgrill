<?php

declare(strict_types=1);

namespace App\Domains\Payments\Repositories;

use App\Models\Payment;

class EloquentPaymentRepository implements PaymentRepositoryInterface
{
    public function findById(int $id): ?Payment
    {
        return Payment::find($id);
    }

    public function findByLocalId(string $localId): ?Payment
    {
        return Payment::where('local_id', $localId)->first();
    }

    public function findByOrderId(int $orderId): ?Payment
    {
        return Payment::where('order_id', $orderId)
            ->orderByDesc('id')
            ->first();
    }

    public function findByProviderTransactionId(string $transactionId): ?Payment
    {
        return Payment::where('provider_transaction_id', $transactionId)->first();
    }

    public function findByIdempotencyKey(string $key): ?Payment
    {
        return Payment::where('idempotency_key', $key)->first();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): Payment
    {
        return Payment::create($data);
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): bool
    {
        return (bool) Payment::where('id', $id)->update($data);
    }

    /**
     * @param array<string, mixed> $match
     * @param array<string, mixed> $values
     */
    public function firstOrCreate(array $match, array $values): Payment
    {
        return Payment::firstOrCreate($match, $values);
    }

    /** @param string[] $statuses */
    public function sumAmountForOrder(int $orderId, array $statuses): float
    {
        return (float) Payment::where('order_id', $orderId)
            ->whereIn('status', $statuses)
            ->sum('amount');
    }

    /**
     * Sum confirmed payments in laari for an order.
     *
     * Uses `COALESCE(amount_laar, ROUND(amount * 100))` so legacy POS
     * payments that only populated `amount` (no `amount_laar`) still
     * contribute to the total. Without this, split-tender flows
     * (cash at the counter via addPayments + BML pay-link for the
     * remainder) under-counted paid totals — the BML confirmation
     * path would either over-charge the customer or refuse to mark
     * the order paid even after the customer settled in full.
     *
     * @param string[] $statuses
     */
    public function sumAmountLaarForOrder(int $orderId, array $statuses): int
    {
        return (int) Payment::where('order_id', $orderId)
            ->whereIn('status', $statuses)
            ->selectRaw('COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0) as total_laar')
            ->value('total_laar');
    }
}
