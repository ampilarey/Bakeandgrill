<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenProductionVariance extends Model
{
    public const TYPES = ['shortage', 'overage', 'rejected', 'waste', 'remake'];

    protected $fillable = [
        'kitchen_production_batch_id', 'kitchen_production_item_id', 'variance_type',
        'qty', 'unit', 'reason', 'recorded_by', 'reviewed_by', 'reviewed_at', 'notes',
    ];

    protected $casts = [
        'qty' => 'float',
        'reviewed_at' => 'datetime',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionBatch::class, 'kitchen_production_batch_id');
    }

    public function productionItem(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionItem::class, 'kitchen_production_item_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
