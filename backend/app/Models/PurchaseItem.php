<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseItem extends Model
{
    protected $fillable = [
        'purchase_id',
        'inventory_item_id',
        'quantity',
        'received_quantity',
        'receive_status',
        'unit_cost',
        'total_cost',
        'received_at',
    ];

    protected $casts = [
        'purchase_id'        => 'integer',
        'inventory_item_id'  => 'integer',
        'quantity'           => 'decimal:4',
        'received_quantity'  => 'decimal:4',
        'unit_cost'          => 'decimal:2',
        'total_cost'         => 'decimal:2',
        'received_at'        => 'datetime',
    ];

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
