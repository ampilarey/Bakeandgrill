<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends Model
{
    protected $fillable = [
        'name',
        'sku',
        'unit',
        'current_stock',
        'reorder_point',
        'unit_cost',
        'last_purchase_price',
        'expiry_date',
        'is_active',
    ];

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    protected $casts = [
        'expiry_date' => 'date',
    ];
}
