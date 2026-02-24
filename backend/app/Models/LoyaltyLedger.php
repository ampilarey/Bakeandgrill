<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable loyalty points transaction log.
 */
class LoyaltyLedger extends Model
{
    protected $table = 'loyalty_ledger';

    protected $fillable = [
        'idempotency_key',
        'customer_id',
        'order_id',
        'type',
        'points',
        'balance_after',
        'notes',
        'metadata',
        'occurred_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'occurred_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
