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
        'cost',
        'track_stock',
        'stock_qty',
        'sku',
        'barcode',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'item_id' => 'integer',
        'sort_order' => 'integer',
        'price' => 'decimal:2',
        'cost' => 'decimal:2',
        'track_stock' => 'boolean',
        'stock_qty' => 'integer',
        'is_active' => 'boolean',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /** True when this variant still has available stock (or does not track stock). */
    public function inStock(): bool
    {
        return !$this->track_stock || $this->stock_qty > 0;
    }

    public function displayName(): string
    {
        return $this->name;
    }

    /** e.g. "Tea - Large" */
    public function fullDisplayName(): string
    {
        return $this->item->name . ' - ' . $this->name;
    }
}
