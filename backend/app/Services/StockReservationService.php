<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Facades\DB;

class StockReservationService
{
    const RESERVATION_MINUTES = 3; // 3-minute reservation

    /**
     * Get available stock (actual - reserved)
     */
    public function getAvailableStock(Item $item): int
    {
        if (!$item->track_stock || $item->availability_type !== 'stock_based') {
            return 9999; // Made to order = unlimited
        }

        $this->releaseExpiredReservations($item->id);

        $reserved = DB::table('stock_reservations')
            ->where('item_id', $item->id)
            ->where('expires_at', '>', now())
            ->sum('quantity');

        return max(0, $item->stock_quantity - $reserved);
    }

    /**
     * Reserve stock when added to cart
     */
    public function reserveStock(int $itemId, int $quantity, string $sessionId): bool
    {
        $item = Item::find($itemId);

        if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
            return true; // No reservation needed
        }

        $this->releaseExpiredReservations($itemId);

        $available = $this->getAvailableStock($item);

        if ($available < $quantity) {
            return false; // Not enough stock
        }

        // Remove old reservation for this session/item
        DB::table('stock_reservations')
            ->where('item_id', $itemId)
            ->where('session_id', $sessionId)
            ->delete();

        // Create new reservation
        DB::table('stock_reservations')->insert([
            'item_id' => $itemId,
            'session_id' => $sessionId,
            'quantity' => $quantity,
            'expires_at' => now()->addMinutes(self::RESERVATION_MINUTES),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return true;
    }

    /**
     * Reserve stock for every prepared item in an online order.
     *
     * Must be called inside the same DB::transaction() as order creation.
     * Uses lockForUpdate() per item to prevent concurrent oversell.
     * Aborts with 422 if any item cannot be fully reserved.
     */
    public function reserveForOrder(Order $order): void
    {
        $ttl = (int) config('ordering.payment_pending_ttl_minutes', 30);
        $order->loadMissing('items.item');

        foreach ($order->items as $orderItem) {
            $item = $orderItem->item;
            if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                continue;
            }

            // Lock the item row for the duration of this transaction
            $locked = Item::lockForUpdate()->find($item->id);
            if (!$locked) {
                // Item was deleted between loading and locking — treat as out of stock
                abort(422, "Item {$item->name} is no longer available.");
            }

            $this->releaseExpiredReservations($locked->id);

            $available = $this->getAvailableStock($locked);

            if ($available < $orderItem->quantity) {
                abort(422, "Not enough stock for {$locked->name}. Available: {$available}, requested: {$orderItem->quantity}");
            }

            // Remove any stale reservation for this order+item (safe retry)
            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->where('order_id', $order->id)
                ->delete();

            DB::table('stock_reservations')->insert([
                'item_id'    => $locked->id,
                'order_id'   => $order->id,
                'session_id' => 'order:' . $order->id,
                'quantity'   => $orderItem->quantity,
                'expires_at' => now()->addMinutes($ttl),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Release all active reservations tied to an order.
     * Safe to call when no reservation exists — it is a no-op.
     */
    public function releaseForOrder(int $orderId): void
    {
        DB::table('stock_reservations')
            ->where('order_id', $orderId)
            ->delete();
    }

    /**
     * Convert reservations for an online order into final deductions.
     *
     * Called from DeductPreparedStockListener on OrderPaid.
     * Idempotent: the StockMovement unique key blocks double-deduction;
     * reservation delete is a no-op if already removed.
     */
    public function convertToDeduction(Order $order, ?int $userId = null): void
    {
        $order->loadMissing('items.item');
        $stockService = app(StockManagementService::class);

        DB::transaction(function () use ($order, $userId, $stockService): void {
            foreach ($order->items as $orderItem) {
                $item = $orderItem->item;
                if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                    continue;
                }

                // Lock the item row before deducting
                $locked = Item::lockForUpdate()->find($item->id);
                if (!$locked) {
                    // Item deleted between payment and deduction — log and skip to avoid blocking fulfillment
                    \Illuminate\Support\Facades\Log::warning("StockReservationService: item {$item->id} not found during convertToDeduction for order {$order->id}");
                    continue;
                }

                $key = 'online:order:' . $order->id . ':item:' . $orderItem->id;
                $stockService->deductPreparedStock($locked, (int) $orderItem->quantity, $key, $order->id, $userId);

                // Release the reservation for this specific order+item
                DB::table('stock_reservations')
                    ->where('item_id', $locked->id)
                    ->where('order_id', $order->id)
                    ->delete();
            }
        });
    }

    /**
     * Release expired reservations
     */
    public function releaseExpiredReservations(?int $itemId = null): void
    {
        $query = DB::table('stock_reservations')
            ->where('expires_at', '<=', now());

        if ($itemId) {
            $query->where('item_id', $itemId);
        }

        $query->delete();
    }

    /**
     * Clear all reservations for a session
     */
    public function clearSessionReservations(string $sessionId): void
    {
        DB::table('stock_reservations')
            ->where('session_id', $sessionId)
            ->delete();
    }
}
