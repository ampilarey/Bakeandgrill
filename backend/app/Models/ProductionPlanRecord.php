<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a saved plan: what the model forecast for an item in a time
 * slot, what was decided, and — once the day is over — what actually sold.
 */
class ProductionPlanRecord extends Model
{
    protected $fillable = [
        'plan_date', 'slot_start', 'slot_end', 'slot_label', 'item_id', 'variant_id',
        'forecast_qty', 'planned_qty', 'actual_qty', 'sold_out', 'created_by',
    ];

    protected $casts = [
        'plan_date' => 'date:Y-m-d',
        'slot_start' => 'integer',
        'slot_end' => 'integer',
        'variant_id' => 'integer',
        'forecast_qty' => 'float',
        'planned_qty' => 'float',
        'actual_qty' => 'float',
        'sold_out' => 'boolean',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
