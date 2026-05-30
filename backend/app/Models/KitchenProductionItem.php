<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KitchenProductionItem extends Model
{
    public const STATUSES = [
        'pending', 'produced', 'partially_received', 'received', 'rejected', 'cancelled',
    ];

    protected $fillable = [
        'kitchen_production_batch_id', 'order_id', 'order_item_id', 'item_id', 'variant_id',
        'inventory_item_id', 'recipe_id', 'free_text_name', 'produced_qty', 'unit',
        'waste_qty', 'extra_qty', 'expected_receive_qty', 'batch_code', 'expires_at',
        'status', 'kitchen_notes',
    ];

    protected $casts = [
        'produced_qty' => 'float',
        'waste_qty' => 'float',
        'extra_qty' => 'float',
        'expected_receive_qty' => 'float',
        'expires_at' => 'datetime',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionBatch::class, 'kitchen_production_batch_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    public function receivingItems(): HasMany
    {
        return $this->hasMany(KitchenReceivingItem::class);
    }

    public function displayName(): string
    {
        if ($this->free_text_name) {
            return $this->free_text_name;
        }
        if ($this->relationLoaded('orderItem') && $this->orderItem) {
            return $this->orderItem->item_name;
        }
        if ($this->relationLoaded('menuItem') && $this->menuItem) {
            return $this->menuItem->name;
        }

        return 'Item #' . $this->id;
    }
}
