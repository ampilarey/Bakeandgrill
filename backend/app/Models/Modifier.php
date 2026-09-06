<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Modifier extends Model
{
    protected $fillable = [
        'name',
        'name_dv',
        'price',
        'inventory_item_id',
        'ingredient_quantity',
        'ingredient_unit',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'price' => 'decimal:2',
        'inventory_item_id' => 'integer',
        'ingredient_quantity' => 'float',
        'is_active' => 'boolean',
    ];

    /**
     * The ingredient one of this modifier uses, if the owner has said so.
     * "Extra cheese" points at the cheese and says 20 g; nothing else about
     * stock changes.
     */
    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function consumesIngredient(): bool
    {
        return $this->inventory_item_id !== null && (float) ($this->ingredient_quantity ?? 0) > 0;
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'item_modifier')
            ->withPivot(['is_required', 'max_quantity'])
            ->withTimestamps();
    }
}
