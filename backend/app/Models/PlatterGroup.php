<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlatterGroup extends Model
{
    protected $fillable = [
        'item_id',
        'name',
        'rule_type',
        'min_count',
        'max_count',
        'size_counts',
        'sort_order',
    ];

    protected $casts = [
        'item_id' => 'integer',
        'min_count' => 'integer',
        'max_count' => 'integer',
        'size_counts' => 'array',
        'sort_order' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function allowedItems(): HasMany
    {
        return $this->hasMany(PlatterGroupItem::class)->orderBy('sort_order')->orderBy('id');
    }
}
