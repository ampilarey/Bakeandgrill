<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Variant extends Model
{
    protected $fillable = [
        'item_id',
        'name',
        'name_dv',
        'price',
        'sku',
        'barcode',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'item_id'    => 'integer',
        'sort_order' => 'integer',
        'price'      => 'decimal:2',
        'is_active'  => 'boolean',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
