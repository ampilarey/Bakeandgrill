<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecurringShoppingListItem extends Model
{
    protected $fillable = [
        'recurring_shopping_list_id', 'inventory_item_id', 'free_text_name',
        'qty', 'unit', 'estimated_unit_cost_laar', 'sort',
    ];

    protected $casts = [
        'qty' => 'float',
        'estimated_unit_cost_laar' => 'integer',
        'sort' => 'integer',
    ];

    public function list(): BelongsTo
    {
        return $this->belongsTo(RecurringShoppingList::class, 'recurring_shopping_list_id');
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
