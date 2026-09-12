<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
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
        'brand',
        'brand_key',
        'name',
        'base_units',
        'default_unit_cost',
        'default_cost_updated_at',
        'barcode',
    ];

    protected $casts = [
        'inventory_item_id' => 'integer',
        'base_units' => 'decimal:6',
        'default_unit_cost' => 'decimal:2',
        'default_cost_updated_at' => 'datetime',
    ];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    /**
     * The packs on offer when buying this item as this brand.
     *
     * A brand's own packs plus the item's shared ones, because most
     * ingredients are bought in the same box whoever made them and only some
     * need splitting out. Passing no brand gives the shared packs alone.
     */
    public function scopeForBrand(Builder $query, ?string $brand): Builder
    {
        $key = InventoryBrandPhoto::keyFor($brand);

        return $key === ''
            ? $query->where('brand_key', '')
            : $query->whereIn('brand_key', ['', $key]);
    }

    /**
     * What a purchase line for this pack should open at, and whether that
     * figure is recent enough to trust.
     *
     * @return array{amount: float, updated_at: string|null}|null
     */
    public function defaultCost(): ?array
    {
        if ($this->default_unit_cost === null) {
            return null;
        }

        return [
            'amount' => (float) $this->default_unit_cost,
            'updated_at' => $this->default_cost_updated_at?->toIso8601String(),
        ];
    }
}
