<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPerformanceCache extends Model
{
    protected $table = 'supplier_performance_cache';

    protected $fillable = [
        'supplier_id', 'purchase_count', 'total_spend',
        'avg_quality', 'avg_delivery', 'avg_accuracy', 'avg_price_score', 'overall_rating',
        'on_time_deliveries', 'total_deliveries', 'period_from', 'period_to', 'refreshed_at',
    ];

    protected $casts = [
        'period_from'  => 'date',
        'period_to'    => 'date',
        'refreshed_at' => 'datetime',
    ];

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
}
