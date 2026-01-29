<?php

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

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
