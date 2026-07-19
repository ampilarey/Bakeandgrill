<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    /** Statuses that still "own" a dine-in seat (matches TableController). */
    public const ACTIVE_ORDER_STATUSES = [
        'pending',
        'in_progress',
        'held',
        'partial',
        'confirmed',
        'preparing',
        'ready',
    ];

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
     * Mark the table available when no other in-flight order still sits on it.
     * Call after detaching an order (type change, cancel, settle).
     */
    public static function releaseIfNoActiveOrders(int $tableId, ?int $exceptOrderId = null): void
    {
        $query = Order::query()
            ->where('restaurant_table_id', $tableId)
            ->whereIn('status', self::ACTIVE_ORDER_STATUSES);

        if ($exceptOrderId !== null) {
            $query->where('id', '!=', $exceptOrderId);
        }

        if ($query->exists()) {
            return;
        }

        static::where('id', $tableId)->update(['status' => 'available']);
    }

    public static function markOccupied(int $tableId): void
    {
        static::where('id', $tableId)->update(['status' => 'occupied']);
    }
}
