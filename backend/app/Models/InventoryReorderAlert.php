<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryReorderAlert extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'current_stock',
        'reorder_point',
        'resolved_at',
    ];

    protected $casts = [
        'inventory_item_id' => 'integer',
        'current_stock' => 'float',
        'reorder_point' => 'float',
        'resolved_at' => 'datetime',
    ];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
