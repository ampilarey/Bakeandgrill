<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    protected $fillable = [
        'customer_id',
        'customer_name',
        'customer_phone',
        'party_size',
        'date',
        'time_slot',
        'duration_minutes',
        'table_id',
        'extra_table_ids',
        'order_id',
        'status',
        'notes',
        'tracking_token',
    ];

    protected $casts = [
        'date' => 'date',
        'party_size' => 'integer',
        'duration_minutes' => 'integer',
        'table_id' => 'integer',
        'extra_table_ids' => 'array',
        'order_id' => 'integer',
    ];

    /** Every table this booking holds: the main one plus any joined for a large party. @return list<int> */
    public function allTableIds(): array
    {
        $ids = [];
        if ($this->table_id) {
            $ids[] = (int) $this->table_id;
        }
        foreach ((array) ($this->extra_table_ids ?? []) as $id) {
            $ids[] = (int) $id;
        }

        return array_values(array_unique(array_filter($ids)));
    }

    /** Minutes since midnight the booking starts and ends (reservation audit, 2026-09-25). @return array{0:int,1:int} */
    public function windowMinutes(): array
    {
        $parts = explode(':', (string) $this->time_slot);
        $start = ((int) ($parts[0] ?? 0)) * 60 + (int) ($parts[1] ?? 0);

        return [$start, $start + max(15, (int) ($this->duration_minutes ?: 60))];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    /** Prepaid dine-in: the paid order this booking holds a table for. */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isConfirmed(): bool
    {
        return $this->status === 'confirmed';
    }

    public function isCancelled(): bool
    {
        return $this->status === 'cancelled';
    }
}
