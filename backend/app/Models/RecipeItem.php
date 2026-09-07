<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecipeItem extends Model
{
    protected $fillable = [
        'recipe_id',
        'inventory_item_id',
        // Null: every size shares this row, scaled by the size's factor.
        // Set: only this size takes it, exactly as written (owner,
        // 2026-09-07: a 1.5L bottle is not three 500ml bottles).
        'variant_id',
        'quantity',
        'unit',
    ];

    protected $casts = [
        'variant_id' => 'integer',
    ];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(Recipe::class);
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    /** Shared by every size of the dish. */
    public function isShared(): bool
    {
        return $this->variant_id === null;
    }
}
