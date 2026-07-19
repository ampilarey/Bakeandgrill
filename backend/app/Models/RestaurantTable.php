<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    /**
     * Order statuses that own a dine-in seat.
     * Aligned with OrderStatusMachine (no dead confirmed/preparing aliases).
     * Includes payment_pending so a BML-awaiting check still holds the table.
     * Excludes paid/completed/cancelled — seat frees when the check is settled.
     */
    public const SEAT_OWNING_STATUSES = [
        'pending',
        'held',
        'in_progress',
        'ready',
        'partial',
        'payment_pending',
    ];

    /** @deprecated Use SEAT_OWNING_STATUSES */
    public const ACTIVE_ORDER_STATUSES = self::SEAT_OWNING_STATUSES;

    protected $fillable = [
        'name',
        'capacity',
        'status',
        'location',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'capacity' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * @return Builder<Order>
     */
    public static function seatOwningOrdersQuery(int $tableId): Builder
    {
        return Order::query()
            ->where('restaurant_table_id', $tableId)
            ->whereIn('status', self::SEAT_OWNING_STATUSES);
    }

    public static function findActiveOrder(int $tableId): ?Order
    {
        return self::seatOwningOrdersQuery($tableId)->latest('id')->first();
    }

    /**
     * Recompute denormalized status from seat-owning orders.
     * Leaves reserved/closed alone when the seat is empty.
     */
    public static function syncOccupancy(int $tableId): string
    {
        $table = static::query()->find($tableId);
        if ($table === null) {
            return 'available';
        }

        $hasActive = self::seatOwningOrdersQuery($tableId)->exists();

        if ($hasActive) {
            if ($table->status !== 'occupied') {
                $table->update(['status' => 'occupied']);
            }

            return 'occupied';
        }

        // Empty seat: free only when currently marked occupied.
        // Preserve reserved / closed admin states.
        if ($table->status === 'occupied') {
            $table->update(['status' => 'available']);

            return 'available';
        }

        return (string) $table->status;
    }

    /**
     * Free the seat when no other seat-owning order remains.
     * Prefer clearing the departing order's restaurant_table_id first,
     * then call this (or syncOccupancy).
     */
    public static function releaseIfNoActiveOrders(int $tableId, ?int $exceptOrderId = null): void
    {
        $query = self::seatOwningOrdersQuery($tableId);
        if ($exceptOrderId !== null) {
            $query->where('id', '!=', $exceptOrderId);
        }

        if ($query->exists()) {
            static::query()->whereKey($tableId)->update(['status' => 'occupied']);

            return;
        }

        static::query()
            ->whereKey($tableId)
            ->where('status', 'occupied')
            ->update(['status' => 'available']);
    }

    public static function markOccupied(int $tableId): void
    {
        static::query()->whereKey($tableId)->update(['status' => 'occupied']);
    }

    /**
     * Assert the table has no other open check, then mark occupied.
     */
    public static function claimForOrder(int $tableId, int $orderId): void
    {
        $other = self::seatOwningOrdersQuery($tableId)
            ->where('id', '!=', $orderId)
            ->exists();

        if ($other) {
            abort(422, 'Table already has an open order.');
        }

        self::markOccupied($tableId);
    }
}
