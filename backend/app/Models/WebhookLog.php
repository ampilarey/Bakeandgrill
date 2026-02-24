<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WebhookLog extends Model
{
    protected $fillable = [
        'idempotency_key',
        'gateway',
        'gateway_event_id',
        'event_type',
        'headers',
        'raw_body',
        'payload',
        'status',
        'error_message',
        'processed_at',
    ];

    protected $casts = [
        'headers' => 'array',
        'payload' => 'array',
        'processed_at' => 'datetime',
    ];
}
