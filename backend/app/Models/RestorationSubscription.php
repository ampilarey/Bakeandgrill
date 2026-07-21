<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RestorationSubscription extends Model
{
    protected $fillable = [
        'service_key',
        'service_incident_id',
        'normalized_mobile',
        'status',
        'consent_text_version',
        'requested_at',
        'notified_at',
        'failed_at',
        'attempts',
        'sms_log_id',
        'request_ip_hash',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'notified_at' => 'datetime',
        'failed_at' => 'datetime',
        'attempts' => 'integer',
    ];

    public function incident(): BelongsTo
    {
        return $this->belongsTo(ServiceIncident::class, 'service_incident_id');
    }
}
