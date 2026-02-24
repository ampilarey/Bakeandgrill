<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionTarget extends Model
{
    protected $fillable = [
        'promotion_id',
        'target_type',
        'target_id',
        'is_exclusion',
    ];

    protected $casts = [
        'is_exclusion' => 'boolean',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
