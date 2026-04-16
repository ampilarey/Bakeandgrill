<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemChannelAvailability extends Model
{
    protected $table = 'item_channel_availability';

    protected $fillable = ['item_id', 'channel', 'is_enabled', 'valid_from', 'valid_until'];

    protected $casts = [
        'is_enabled' => 'boolean',
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
