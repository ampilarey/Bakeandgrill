<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One item on a stocktake sheet.
 *
 * `snapshot_qty` is what the system believed when the sheet was opened, not
 * what it believes now — see the migration for why that distinction is the
 * whole point.
 */
class StockCountLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'stock_count_session_id', 'inventory_item_id',
        'snapshot_qty', 'snapshot_unit_cost',
        'counted_qty', 'note', 'counted_by', 'counted_at',
    ];

    protected $casts = [
        'snapshot_qty' => 'float',
        'snapshot_unit_cost' => 'float',
        'counted_qty' => 'float',
        'counted_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(StockCountSession::class, 'stock_count_session_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function isCounted(): bool
    {
        return $this->counted_qty !== null;
    }

    /** Counted minus expected. Positive means more on the shelf than expected. */
    public function variance(): float
    {
        return $this->isCounted() ? (float) $this->counted_qty - (float) $this->snapshot_qty : 0.0;
    }

    /** What that difference is worth, at the cost frozen when the sheet opened. */
    public function varianceValueMvr(): float
    {
        return abs($this->variance()) * (float) $this->snapshot_unit_cost;
    }
}
