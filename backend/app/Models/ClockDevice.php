<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A fingerprint or palm clock that sends punches over ADMS (`App\Domains\Shifts\ClockMachine`). */
class ClockDevice extends Model
{
    protected $fillable = ['serial', 'name', 'model', 'allowed_at', 'last_seen_at', 'last_ip', 'att_stamp', 'device_users'];

    protected $casts = [
        'allowed_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'device_users' => 'array',
    ];

    public function punches(): HasMany
    {
        return $this->hasMany(ClockDevicePunch::class);
    }

    public function isAllowed(): bool
    {
        return $this->allowed_at !== null;
    }
}
