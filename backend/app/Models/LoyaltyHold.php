<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Represents a reservation of loyalty points for an order.
 *
 * Lifecycle:
 *   active → consumed (OrderPaid)
 *   active → released (OrderCancelled or customer removes loyalty)
 *   active → expired (cron: app:expire-loyalty-holds)
 */
class LoyaltyHold extends Model
{
    protected $fillable = [
        'idempotency_key',
        'customer_id',
        'order_id',
        'points_held',
        'discount_laar',
        'status',
        'expires_at',
        'consumed_at',
        'released_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'consumed_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
