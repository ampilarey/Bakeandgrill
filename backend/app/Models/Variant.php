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
        'low_stock_threshold',
        'consumption_factor',
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
        'low_stock_threshold' => 'integer',
        'consumption_factor' => 'float',
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

    /**
     * How much of the item's recipe one of this variant uses.
     *
     * Sizes of the same dish are cut from one pool of ingredients: with a
     * whole beetle leaf as the recipe, "Full" is 1 and "Half" is 0.5, so 50
     * leaves serve 50 fulls, 100 halves, or any mix. Anything the column
     * cannot express (never set, or a negative left by a bad import) reads as
     * a whole portion — the behaviour every variant had before the column
     * existed. Zero is legitimate: a size that draws nothing from the pool.
     */
    public function consumptionFactor(): float
    {
        $factor = $this->consumption_factor;

        if ($factor === null || !is_numeric($factor) || (float) $factor < 0) {
            return 1.0;
        }

        return (float) $factor;
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
