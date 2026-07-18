<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscountCardBatch extends Model
{
    protected $fillable = [
        'name',
        'type',
        'discount_value',
        'min_order_laar',
        'starts_at',
        'expires_at',
        'max_uses_per_card',
        'max_uses_per_customer',
        'quantity',
        'note',
        'created_by',
    ];

    protected $casts = [
        'discount_value' => 'integer',
        'min_order_laar' => 'integer',
        'max_uses_per_card' => 'integer',
        'max_uses_per_customer' => 'integer',
        'quantity' => 'integer',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_by' => 'integer',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return Builder<Promotion> */
    public function cardsQuery(): Builder
    {
        return Promotion::withTrashed()
            ->where('metadata->kind', 'discount_card')
            ->where('metadata->batch_id', $this->id)
            ->orderBy('id');
    }
}
