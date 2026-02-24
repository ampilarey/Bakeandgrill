<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'idempotency_key',
        'order_id',
        'method',
        'gateway',
        'currency',
        'amount',
        'amount_laar',
        'local_id',
        'provider_transaction_id',
        'status',
        'reference_number',
        'gateway_response',
        'processed_at',
    ];

    protected $casts = [
        'gateway_response' => 'array',
        'processed_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
