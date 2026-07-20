<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CateringRequestLine extends Model
{
    protected $fillable = [
        'catering_request_id',
        'item_id',
        'variant_id',
        'name',
        'quantity',
        'unit_price',
        'notes',
        'is_custom',
        'price_needs_review',
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'is_custom' => 'boolean',
        'price_needs_review' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function cateringRequest(): BelongsTo
    {
        return $this->belongsTo(CateringRequest::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
