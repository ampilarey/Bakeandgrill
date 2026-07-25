<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignageScreen extends Model
{
    protected $fillable = [
        'store_id', 'name', 'slug', 'group_id', 'playlist_id', 'orientation',
        'resolution', 'refresh_seconds', 'fallback', 'overrides', 'is_default',
    ];

    protected $casts = [
        'fallback' => 'array',
        'overrides' => 'array',
        'is_default' => 'boolean',
        'store_id' => 'integer',
        'refresh_seconds' => 'integer',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(SignageGroup::class, 'group_id');
    }

    public function playlist(): BelongsTo
    {
        return $this->belongsTo(SignagePlaylist::class, 'playlist_id');
    }
}
