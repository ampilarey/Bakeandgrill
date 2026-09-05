<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPriceHistory extends Model
{
    protected $table = 'supplier_price_history';

    protected $fillable = [
        'supplier_id', 'inventory_item_id', 'purchase_id', 'unit_price', 'unit', 'recorded_at',
        // Carried from the purchase line, so "what does each brand cost" is
        // answerable from the one table every price comparison already reads.
        'brand',
    ];

    protected $casts = ['recorded_at' => 'date'];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }
}
