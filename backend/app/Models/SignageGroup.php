<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SignageGroup extends Model
{
    protected $fillable = [
        'store_id', 'name', 'playlist_id', 'theme', 'orientation', 'refresh_seconds',
    ];

    protected $casts = [
        'theme' => 'array',
        'store_id' => 'integer',
        'refresh_seconds' => 'integer',
    ];

    public function playlist(): BelongsTo
    {
        return $this->belongsTo(SignagePlaylist::class, 'playlist_id');
    }

    public function screens(): HasMany
    {
        return $this->hasMany(SignageScreen::class, 'group_id');
    }
}
