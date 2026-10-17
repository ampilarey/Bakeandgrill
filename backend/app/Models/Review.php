<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $fillable = [
        'customer_id',
        'order_id',
        'item_id',
        'rating',
        'comment',
        'type',
        'status',
        'is_anonymous',
        'photos',
        'reply',
        'replied_at',
        'replied_by',
    ];

    protected $casts = [
        'rating' => 'integer',
        'is_anonymous' => 'boolean',
        'photos' => 'array',
        'helpful_count' => 'integer',
        'replied_at' => 'datetime',
    ];

    /** From a real order, not typed in by staff (feature 6). */
    public function isVerified(): bool
    {
        return $this->order_id !== null;
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
