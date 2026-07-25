<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignageCampaign extends Model
{
    protected $fillable = [
        'store_id', 'name', 'playlist_id', 'slides', 'date_start', 'date_end',
        'days', 'windows', 'priority', 'is_active',
    ];

    protected $casts = [
        'slides' => 'array',
        'days' => 'array',
        'windows' => 'array',
        'date_start' => 'date',
        'date_end' => 'date',
        'is_active' => 'boolean',
        'priority' => 'integer',
        'store_id' => 'integer',
    ];

    public function playlist(): BelongsTo
    {
        return $this->belongsTo(SignagePlaylist::class, 'playlist_id');
    }
}
