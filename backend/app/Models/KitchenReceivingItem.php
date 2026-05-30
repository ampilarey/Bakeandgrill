<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenReceivingItem extends Model
{
    protected $fillable = [
        'kitchen_receiving_batch_id', 'kitchen_production_item_id',
        'received_qty', 'rejected_qty', 'missing_qty', 'condition', 'action', 'notes',
    ];

    protected $casts = [
        'received_qty' => 'float',
        'rejected_qty' => 'float',
        'missing_qty' => 'float',
    ];

    public function receivingBatch(): BelongsTo
    {
        return $this->belongsTo(KitchenReceivingBatch::class, 'kitchen_receiving_batch_id');
    }

    public function productionItem(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionItem::class, 'kitchen_production_item_id');
    }
}
