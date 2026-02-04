<?php

namespace App\Services;

use App\Models\Item;
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
