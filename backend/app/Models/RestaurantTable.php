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
        'qr_token',
    ];

    protected $casts = [
        'capacity' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * The token behind this table's QR code, minting one if it has none.
     *
     * Not the table id: a QR that read `?table=4` would invite `?table=5`,
     * letting someone send their order — and the kitchen chit — to another
     * party's table, and letting anyone print the whole floor by counting.
     */
    public function ensureQrToken(): string
    {
        if (is_string($this->qr_token) && $this->qr_token !== '') {
            return $this->qr_token;
        }

        $token = static::mintQrToken();
        $this->forceFill(['qr_token' => $token])->save();

        return $token;
    }

    /** A new token for this table, invalidating whatever is printed today. */
    public function rotateQrToken(): string
    {
        $token = static::mintQrToken();
        $this->forceFill(['qr_token' => $token])->save();

        return $token;
    }

    public static function mintQrToken(): string
    {
        do {
            $token = strtolower(\Illuminate\Support\Str::random(24));
        } while (static::query()->where('qr_token', $token)->exists());

        return $token;
    }

    /** What the QR encodes: the ordering app, scoped to this table. */
    public function qrUrl(): string
    {
        $base = rtrim((string) config('app.order_app_url', config('app.url')), '/');

        return $base . '/?table=' . $this->ensureQrToken();
    }

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

        $blocking = self::blockingReservation($tableId, $orderId);
        if ($blocking) {
            $time = substr((string) $blocking->time_slot, 0, 5);
            abort(422, "Table is reserved for a {$time} booking ({$blocking->customer_name}). Seat the walk-in elsewhere.");
        }

        self::markOccupied($tableId);
    }

    /**
     * Table guarantee: a CONFIRMED reservation holds its table from 60 minutes
     * before the slot until the slot end, so a walk-in cannot take the seat a
     * prepaid (or staff-confirmed) booking is counting on. The reservation's
     * own linked order is exempt — that is the Seat action claiming its table.
     */
    public static function blockingReservation(int $tableId, ?int $exceptOrderId = null): ?Reservation
    {
        $now = now();

        $candidates = Reservation::query()
            ->where('table_id', $tableId)
            ->where('status', 'confirmed')
            ->whereDate('date', $now->toDateString())
            ->when($exceptOrderId !== null, function ($q) use ($exceptOrderId) {
                $q->where(function ($w) use ($exceptOrderId) {
                    $w->whereNull('order_id')->orWhere('order_id', '!=', $exceptOrderId);
                });
            })
            ->get();

        foreach ($candidates as $reservation) {
            try {
                $slotStart = \Carbon\Carbon::parse(
                    $reservation->date->toDateString() . ' ' . $reservation->time_slot,
                );
            } catch (\Throwable) {
                continue;
            }

            $holdFrom = $slotStart->copy()->subMinutes(60);
            $holdUntil = $slotStart->copy()->addMinutes(max(30, (int) $reservation->duration_minutes));

            if ($now->between($holdFrom, $holdUntil)) {
                return $reservation;
            }
        }

        return null;
    }
}
