<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebhookLog extends Model
{
    protected $fillable = [
        // BML incoming webhook fields (2026_02_09 migration)
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
        // Outgoing webhook subscription log fields
        'direction',
        'webhook_subscription_id',
        'url',
        'event',
        'response_code',
        'response_body',
        'source',
        'processed',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(WebhookSubscription::class, 'webhook_subscription_id');
    }
}
