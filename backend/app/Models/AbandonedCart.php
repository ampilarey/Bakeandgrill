<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AbandonedCart extends Model
{
    protected $fillable = [
        'customer_id',
        'phone',
        'cart_token',
        'items_json',
        'subtotal_laar',
        'snapshot_at',
        'reminded_at',
    ];

    protected $casts = [
        'items_json' => 'array',
        'snapshot_at' => 'datetime',
        'reminded_at' => 'datetime',
        'subtotal_laar' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
