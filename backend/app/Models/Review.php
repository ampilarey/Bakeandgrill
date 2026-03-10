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
    ];

    protected $casts = [
        'rating'       => 'integer',
        'is_anonymous' => 'boolean',
    ];

    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function order(): BelongsTo    { return $this->belongsTo(Order::class); }
    public function item(): BelongsTo     { return $this->belongsTo(Item::class); }
}
