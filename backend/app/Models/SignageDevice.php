<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignageDevice extends Model
{
    protected $fillable = [
        'store_id',
        'screen_id',
        'device_id',
        'pairing_code',
        'approved',
        'last_seen_at',
        'meta',
        'queued_command',
    ];

    protected function casts(): array
    {
        return [
            'approved' => 'boolean',
            'last_seen_at' => 'datetime',
            'meta' => 'array',
            'queued_command' => 'array',
        ];
    }

    public function screen(): BelongsTo
    {
        return $this->belongsTo(SignageScreen::class, 'screen_id');
    }
}
