<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class MediaCollection extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        static::saving(function (MediaCollection $collection) {
            if ($collection->slug === null || $collection->slug === '') {
                $collection->slug = Str::slug((string) $collection->name);
            }
        });
    }

    public function assets(): BelongsToMany
    {
        return $this->belongsToMany(
            Media::class,
            'media_asset_collection',
            'media_collection_id',
            'media_asset_id',
        );
    }
}
