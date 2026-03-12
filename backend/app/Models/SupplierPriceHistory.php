<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPriceHistory extends Model
{
    protected $fillable = [
        'supplier_id', 'inventory_item_id', 'purchase_id', 'unit_price', 'unit', 'recorded_at',
    ];

    protected $casts = ['recorded_at' => 'date'];

    public function supplier(): BelongsTo       { return $this->belongsTo(Supplier::class); }
    public function inventoryItem(): BelongsTo  { return $this->belongsTo(InventoryItem::class); }
    public function purchase(): BelongsTo       { return $this->belongsTo(Purchase::class); }
}
