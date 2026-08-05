<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemPhoto extends Model
{
    protected $fillable = [
        'item_id',
        'url',
        'original_url',
        'thumb_url',
        'image_webp_url',
        'thumb_webp_url',
        'alt_text',
        'sort_order',
        'is_primary',
        'media_type',
        'poster_url',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_primary' => 'boolean',
    ];

    public function isVideo(): bool
    {
        return ($this->media_type ?? 'image') === 'video';
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
