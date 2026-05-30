<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KitchenProductionBatch extends Model
{
    public const PRODUCTION_TYPES = [
        'order_bound', 'prepared_stock', 'remake', 'waste_only', 'staff_meal', 'test_batch', 'other',
    ];

    public const STATUSES = [
        'draft', 'submitted', 'partially_received', 'received', 'rejected', 'cancelled',
    ];

    protected $fillable = [
        'batch_no', 'production_type', 'source', 'status', 'station', 'order_id',
        'produced_by', 'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at',
        'cancellation_reason', 'notes',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(KitchenProductionItem::class);
    }

    public function receivingBatches(): HasMany
    {
        return $this->hasMany(KitchenReceivingBatch::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(KitchenProductionAttachment::class);
    }

    public function variances(): HasMany
    {
        return $this->hasMany(KitchenProductionVariance::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'produced_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}
