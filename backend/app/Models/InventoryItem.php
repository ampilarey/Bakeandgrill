<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends Model
{
    protected $fillable = [
        'name', 'sku', 'unit', 'current_stock', 'reorder_point', 'reorder_quantity',
        'unit_cost', 'last_purchase_price', 'expiry_date', 'is_active',
        'inventory_category_id', 'preferred_supplier_id', 'storage_location', 'notes',
    ];

    protected $casts = [
        'expiry_date'   => 'date',
        'is_active'     => 'boolean',
        'current_stock' => 'float',
        'unit_cost'     => 'decimal:4',
        'reorder_point' => 'float',
    ];

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'inventory_category_id');
    }

    public function preferredSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'preferred_supplier_id');
    }
}
