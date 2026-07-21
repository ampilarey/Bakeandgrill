<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceIncident extends Model
{
    protected $fillable = [
        'service_key',
        'incident_type',
        'status',
        'public_message',
        'internal_note',
        'started_at',
        'scheduled_end_at',
        'restored_at',
        'created_by',
        'restored_by',
        'notified_count',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'scheduled_end_at' => 'datetime',
        'restored_at' => 'datetime',
        'notified_count' => 'integer',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(RestorationSubscription::class, 'service_incident_id');
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function restorer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'restored_by');
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }
}
