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
        // The GST inside the typed price, and the rate it was charged at.
        // The typed price is the money handed over; this is the part of it
        // that comes back once a tax invoice is on file.
        'gst_rate_bp',
        'gst_laar',
        // What was on the box: "2 Case" of 210 each. A snapshot, so the order
        // still reads the same after somebody edits the pack size.
        'pack_name',
        'pack_size',
        'pack_quantity',
        // Which brand this purchase was. The item is one thing on the shelf;
        // the brand is a fact about the buying, and about the price.
        'brand',
        'received_at',
    ];

    protected $casts = [
        'purchase_id' => 'integer',
        'inventory_item_id' => 'integer',
        'quantity' => 'decimal:4',
        'received_quantity' => 'decimal:4',
        // Six decimals: a case of 210 eggs at MVR 415 is 1.976190 each, and
        // rounding that to money restates the case as MVR 415.80.
        'unit_cost' => 'decimal:6',
        'total_cost' => 'decimal:2',
        'gst_rate_bp' => 'integer',
        'gst_laar' => 'integer',
        'pack_size' => 'decimal:6',
        'pack_quantity' => 'decimal:6',
        'received_at' => 'datetime',
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
