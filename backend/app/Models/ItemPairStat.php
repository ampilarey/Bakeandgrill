<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemPairStat extends Model
{
    protected $fillable = [
        'item_id',
        'paired_item_id',
        'pair_count',
        'computed_at',
    ];

    protected $casts = [
        'item_id' => 'integer',
        'paired_item_id' => 'integer',
        'pair_count' => 'integer',
        'computed_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    public function pairedItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'paired_item_id');
    }
}
