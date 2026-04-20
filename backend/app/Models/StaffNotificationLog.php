<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffNotificationLog extends Model
{
    protected $fillable = [
        'order_id',
        'event_type',
        'recipient_type',
        'recipient_id',
        'phone',
        'message',
        'status',
        'idempotency_key',
        'fallback_used',
        'sms_log_id',
        'sent_at',
        'failed_at',
    ];

    protected function casts(): array
    {
        return [
            'fallback_used' => 'boolean',
            'sent_at'       => 'datetime',
            'failed_at'     => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function smsLog(): BelongsTo
    {
        return $this->belongsTo(SmsLog::class);
    }

    public function isSent(): bool
    {
        return $this->status === 'sent';
    }

    public function isFailed(): bool
    {
        return $this->status === 'failed';
    }

    public function scopeForOrder($query, int $orderId)
    {
        return $query->where('order_id', $orderId);
    }

    public function scopeForEvent($query, string $eventType)
    {
        return $query->where('event_type', $eventType);
    }
}
