<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemPackagingOption extends Model
{
    protected $fillable = [
        'item_id',
        'name',
        'name_dv',
        'fee',
        'is_default',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'item_id' => 'integer',
        'fee' => 'decimal:2',
        'is_default' => 'boolean',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
