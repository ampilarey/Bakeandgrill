<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One punch exactly as a clock sent it, kept whether or not it became a time punch. */
class ClockDevicePunch extends Model
{
    protected $fillable = [
        'clock_device_id', 'device_user_no', 'punched_at', 'state', 'verify',
        'user_id', 'time_punch_id', 'result',
    ];

    protected $casts = [
        'punched_at' => 'datetime',
        'state' => 'integer',
        'verify' => 'integer',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(ClockDevice::class, 'clock_device_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
