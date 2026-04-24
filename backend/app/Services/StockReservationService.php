<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\Order;
use App\Models\Variant;
use Illuminate\Support\Facades\DB;

class StockReservationService
{
    const RESERVATION_MINUTES = 3; // 3-minute reservation

    /**
     * Available stock for a simple (non-variant-tracking) item.
     */
    public function getAvailableStock(Item $item): int
    {
        if (! $item->track_stock || $item->availability_type !== 'stock_based') {
            return 9999;
        }

        $this->releaseExpiredReservations($item->id);

        $reserved = DB::table('stock_reservations')
            ->where('item_id', $item->id)
            ->whereNull('variant_id')
            ->where('expires_at', '>', now())
            ->sum('quantity');

        return max(0, $item->stock_quantity - $reserved);
    }

    /**
     * Available stock for a specific variant.
     */
    public function getAvailableVariantStock(Variant $variant): int
    {
        if (! $variant->track_stock) {
            return 9999;
        }

        $this->releaseExpiredVariantReservations($variant->id);

        $reserved = DB::table('stock_reservations')
            ->where('variant_id', $variant->id)
            ->where('expires_at', '>', now())
            ->sum('quantity');

        return max(0, $variant->stock_qty - $reserved);
    }

    /**
     * Reserve stock when added to cart
     */
    public function reserveStock(int $itemId, int $quantity, string $sessionId): bool
    {
        $item = Item::find($itemId);

        if (! $item || ! $item->track_stock || $item->availability_type !== 'stock_based') {
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
     * Reserve stock for every stock-tracked line in an online order.
     *
     * Variant lines with track_stock=true reserve against variant.stock_qty.
     * Simple item lines reserve against item.stock_quantity (existing behaviour).
     *
     * Must be called inside the same DB::transaction() as order creation.
     */
    public function reserveForOrder(Order $order): void
    {
        $ttl = (int) config('ordering.payment_pending_ttl_minutes', 30);
        $order->loadMissing('items.item', 'items.variant');

        foreach ($order->items as $orderItem) {
            $item = $orderItem->item;
            $variant = $orderItem->variant;

            // ── Variant-level reservation ─────────────────────────────────────
            if ($variant && $variant->track_stock) {
                $lockedVariant = Variant::lockForUpdate()->find($variant->id);
                if (! $lockedVariant) {
                    abort(422, "Option \"{$variant->name}\" for \"{$item->name}\" is no longer available.");
                }

                $this->releaseExpiredVariantReservations($lockedVariant->id);
                $available = $this->getAvailableVariantStock($lockedVariant);

                if ($available < $orderItem->quantity) {
                    abort(422, "Not enough stock for \"{$item->name} - {$variant->name}\". Available: {$available}, requested: {$orderItem->quantity}");
                }

                DB::table('stock_reservations')
                    ->where('variant_id', $lockedVariant->id)
                    ->where('order_id', $order->id)
                    ->delete();

                DB::table('stock_reservations')->insert([
                    'item_id' => $item?->id,
                    'variant_id' => $lockedVariant->id,
                    'order_id' => $order->id,
                    'session_id' => 'order:'.$order->id,
                    'quantity' => $orderItem->quantity,
                    'expires_at' => now()->addMinutes($ttl),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                continue;
            }

            // ── Item-level reservation (unchanged behaviour) ──────────────────
            if (! $item || ! $item->track_stock || $item->availability_type !== 'stock_based') {
                continue;
            }

            $locked = Item::lockForUpdate()->find($item->id);
            if (! $locked) {
                abort(422, "Item {$item->name} is no longer available.");
            }

            $this->releaseExpiredReservations($locked->id);
            $available = $this->getAvailableStock($locked);

            if ($available < $orderItem->quantity) {
                abort(422, "Not enough stock for {$locked->name}. Available: {$available}, requested: {$orderItem->quantity}");
            }

            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->whereNull('variant_id')
                ->where('order_id', $order->id)
                ->delete();

            DB::table('stock_reservations')->insert([
                'item_id' => $locked->id,
                'variant_id' => null,
                'order_id' => $order->id,
                'session_id' => 'order:'.$order->id,
                'quantity' => $orderItem->quantity,
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
     * Convert reservations for an online order into final stock deductions.
     *
     * Called from DeductPreparedStockListener on OrderPaid.
     * Idempotent: the StockMovement unique key blocks double-deduction.
     */
    public function convertToDeduction(Order $order, ?int $userId = null): void
    {
        $order->loadMissing('items.item', 'items.variant');
        $stockService = app(StockManagementService::class);

        DB::transaction(function () use ($order, $userId, $stockService): void {
            foreach ($order->items as $orderItem) {
                $item = $orderItem->item;
                $variant = $orderItem->variant;

                $key = 'online:order:'.$order->id.':item:'.$orderItem->id;

                // ── Variant-level deduction ───────────────────────────────────
                if ($variant && $variant->track_stock) {
                    $lockedVariant = Variant::lockForUpdate()->find($variant->id);
                    if (! $lockedVariant) {
                        \Illuminate\Support\Facades\Log::warning(
                            "StockReservationService: variant {$variant->id} not found during convertToDeduction for order {$order->id}",
                        );

                        continue;
                    }

                    $stockService->deductVariantStock($lockedVariant, (int) $orderItem->quantity, $key, $order->id, $userId);

                    DB::table('stock_reservations')
                        ->where('variant_id', $lockedVariant->id)
                        ->where('order_id', $order->id)
                        ->delete();

                    continue;
                }

                // ── Item-level deduction (unchanged behaviour) ────────────────
                if (! $item || ! $item->track_stock || $item->availability_type !== 'stock_based') {
                    continue;
                }

                $locked = Item::lockForUpdate()->find($item->id);
                if (! $locked) {
                    \Illuminate\Support\Facades\Log::warning(
                        "StockReservationService: item {$item->id} not found during convertToDeduction for order {$order->id}",
                    );

                    continue;
                }

                $stockService->deductPreparedStock($locked, (int) $orderItem->quantity, $key, $order->id, $userId);

                DB::table('stock_reservations')
                    ->where('item_id', $locked->id)
                    ->whereNull('variant_id')
                    ->where('order_id', $order->id)
                    ->delete();
            }
        });
    }

    /**
     * Release expired item-level reservations.
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
     * Release expired variant-level reservations.
     */
    public function releaseExpiredVariantReservations(?int $variantId = null): void
    {
        $query = DB::table('stock_reservations')
            ->where('expires_at', '<=', now())
            ->whereNotNull('variant_id');

        if ($variantId) {
            $query->where('variant_id', $variantId);
        }

        $query->delete();
    }

    /**
     * Clear all reservations for a session.
     */
    public function clearSessionReservations(string $sessionId): void
    {
        DB::table('stock_reservations')
            ->where('session_id', $sessionId)
            ->delete();
    }
}
