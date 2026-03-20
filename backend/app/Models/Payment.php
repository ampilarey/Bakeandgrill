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
        'status',
        'reference_number',
        'processed_at',
    ];

    protected $casts = [
        'order_id'         => 'integer',
        'amount'           => 'decimal:2',
        'amount_laar'      => 'integer',
        'gateway_response' => 'array',
        'processed_at'     => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
