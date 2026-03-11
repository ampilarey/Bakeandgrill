<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemPhoto extends Model
{
    protected $fillable = ['item_id', 'url', 'alt_text', 'sort_order', 'is_primary'];

    protected $casts = ['sort_order' => 'integer', 'is_primary' => 'boolean'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
