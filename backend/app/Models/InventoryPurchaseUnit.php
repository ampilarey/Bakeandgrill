<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A way you buy an item: "Case", "Tray", "Sack".
 *
 * `base_units` is how many of the item's own unit sit inside one of these. An
 * egg counted in pieces has a Tray of 30 and a Case of 210. The number is
 * always against the base unit even when somebody entered it as "7 trays",
 * so pricing a purchase line is one multiplication rather than a walk up a
 * chain that might contain a loop.
 */
class InventoryPurchaseUnit extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'name',
        'base_units',
        'barcode',
    ];

    protected $casts = [
        'inventory_item_id' => 'integer',
        'base_units' => 'decimal:6',
    ];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
