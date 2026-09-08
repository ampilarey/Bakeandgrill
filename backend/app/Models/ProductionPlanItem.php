<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How one menu item (or one size of it) is planned. A row only exists once
 * somebody has changed something away from the defaults.
 */
class ProductionPlanItem extends Model
{
    public const DEFAULT_SERVICE_LEVEL = 85;

    protected $fillable = [
        'item_id', 'variant_id', 'enabled', 'service_level_pct', 'round_to', 'min_qty', 'notes',
    ];

    protected $casts = [
        'variant_id' => 'integer',
        'enabled' => 'boolean',
        'service_level_pct' => 'integer',
        'round_to' => 'integer',
        'min_qty' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
