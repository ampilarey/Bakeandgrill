<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SignagePlaylist extends Model
{
    protected $fillable = [
        'store_id', 'name', 'slides', 'theme', 'is_active',
    ];

    protected $casts = [
        'slides' => 'array',
        'theme' => 'array',
        'is_active' => 'boolean',
        'store_id' => 'integer',
    ];

    public function groups(): HasMany
    {
        return $this->hasMany(SignageGroup::class, 'playlist_id');
    }

    public function screens(): HasMany
    {
        return $this->hasMany(SignageScreen::class, 'playlist_id');
    }
}
