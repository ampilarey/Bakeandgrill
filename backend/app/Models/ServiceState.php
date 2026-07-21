<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceState extends Model
{
    protected $fillable = [
        'service_key',
        'group',
        'status',
        'reason_type',
        'public_message',
        'internal_note',
        'alternatives',
        'allow_existing_operations',
        'allow_admin_bypass',
        'starts_at',
        'ends_at',
        'current_incident_id',
        'notify_enabled',
        'changed_by',
    ];

    protected $casts = [
        'alternatives' => 'array',
        'allow_existing_operations' => 'boolean',
        'allow_admin_bypass' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'notify_enabled' => 'boolean',
    ];

    public function incident(): BelongsTo
    {
        return $this->belongsTo(ServiceIncident::class, 'current_incident_id');
    }

    public function changer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }

    public function isAvailable(): bool
    {
        return $this->status === 'available';
    }
}
