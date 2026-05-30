<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseRequestItem extends Model
{
    public const STATUSES = [
        'pending', 'approved', 'assigned', 'bought', 'partially_bought',
        'not_available', 'received', 'cancelled',
    ];

    public const TERMINAL_STATUSES = ['received', 'not_available', 'cancelled'];

    protected $fillable = [
        'purchase_request_id', 'inventory_item_id', 'menu_item_id', 'free_text_name',
        'category', 'requested_qty', 'requested_unit', 'approved_qty', 'actual_qty',
        'actual_unit', 'estimated_unit_cost_laar', 'actual_unit_cost_laar', 'actual_total_laar',
        'supplier_id', 'supplier_name_text', 'status', 'reason', 'notes',
        'buyer_notes', 'verified_notes', 'bought_at', 'received_at',
    ];

    protected $casts = [
        'requested_qty' => 'decimal:3',
        'approved_qty' => 'decimal:3',
        'actual_qty' => 'decimal:3',
        'estimated_unit_cost_laar' => 'integer',
        'actual_unit_cost_laar' => 'integer',
        'actual_total_laar' => 'integer',
        'bought_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'menu_item_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(PurchaseRequestAttachment::class);
    }

    public function displayName(): string
    {
        if ($this->free_text_name) {
            return $this->free_text_name;
        }
        if ($this->relationLoaded('inventoryItem') && $this->inventoryItem) {
            return $this->inventoryItem->name;
        }
        if ($this->inventory_item_id) {
            return InventoryItem::find($this->inventory_item_id)?->name ?? 'Item #' . $this->id;
        }
        if ($this->relationLoaded('menuItem') && $this->menuItem) {
            return $this->menuItem->name;
        }

        return 'Item #' . $this->id;
    }
}
