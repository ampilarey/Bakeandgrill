<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WasteLog extends Model
{
    protected $fillable = [
        'item_id', 'inventory_item_id', 'user_id',
        'quantity', 'unit', 'cost_estimate', 'reason', 'notes',
    ];

    protected $casts = [
        'quantity'      => 'decimal:3',
        'cost_estimate' => 'decimal:2',
    ];

    public function item(): BelongsTo         { return $this->belongsTo(Item::class); }
    public function inventoryItem(): BelongsTo { return $this->belongsTo(InventoryItem::class); }
    public function user(): BelongsTo          { return $this->belongsTo(User::class); }
}
