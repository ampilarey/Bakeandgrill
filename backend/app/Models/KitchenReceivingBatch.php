<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KitchenReceivingBatch extends Model
{
    public const STATUSES = ['received', 'partially_received', 'rejected'];

    protected $fillable = [
        'kitchen_production_batch_id', 'received_by', 'received_at', 'status',
        'receive_location', 'notes',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    public function productionBatch(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionBatch::class, 'kitchen_production_batch_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(KitchenReceivingItem::class);
    }
}
