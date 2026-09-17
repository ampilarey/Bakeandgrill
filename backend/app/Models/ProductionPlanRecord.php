<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One line of a saved plan: what the model forecast for an item in a time
 * slot, what was decided, and — once the day is over — what actually sold.
 *
 * It is also the task: who was asked to make it and by when, how much they
 * then made (the batches they sent point back here), and how much of that
 * the counter took in.
 */
class ProductionPlanRecord extends Model
{
    protected $fillable = [
        'plan_date', 'slot_start', 'slot_end', 'slot_label', 'item_id', 'variant_id',
        'forecast_qty', 'planned_qty', 'actual_qty', 'sold_out', 'created_by',
        'assigned_to', 'due_time', 'made_qty', 'received_qty', 'made_at', 'made_by',
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
        'made_qty' => 'float',
        'received_qty' => 'float',
        'made_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function maker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'made_by');
    }

    public function productionItems(): HasMany
    {
        return $this->hasMany(KitchenProductionItem::class, 'production_plan_record_id');
    }
}
