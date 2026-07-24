<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Media extends Model
{
    protected $table = 'media_assets';

    protected $fillable = [
        'disk',
        'path',
        'media_type',
        'mime_type',
        'file_size',
        'width',
        'height',
        'duration_seconds',
        'thumb_url',
        'original_url',
        'title',
        'alt_text',
        'tags',
        'source',
        'checksum',
        'uploaded_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
        'duration_seconds' => 'integer',
        'tags' => 'array',
    ];

    protected $appends = ['url'];

    public function getUrlAttribute(): string
    {
        $path = (string) $this->path;
        if ($path === '') {
            return '';
        }

        // Domain-relative so admin previews work regardless of APP_URL.
        return '/storage/' . ltrim($path, '/');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function collections(): BelongsToMany
    {
        return $this->belongsToMany(
            MediaCollection::class,
            'media_asset_collection',
            'media_asset_id',
            'media_collection_id',
        );
    }

    public function versions(): HasMany
    {
        return $this->hasMany(MediaAssetVersion::class, 'media_asset_id')->orderByDesc('id');
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('media_type', $type);
    }

    public function scopeSearch(Builder $query, string $q): Builder
    {
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';

        return $query->where(function (Builder $inner) use ($like) {
            $inner->where('title', 'like', $like)
                ->orWhere('alt_text', 'like', $like)
                ->orWhere('path', 'like', $like)
                ->orWhere('tags', 'like', $like);
        });
    }
}
