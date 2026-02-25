<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Full audit log of every SMS sent by the system.
 * Covers OTP, bulk promotions, campaigns, and transactional messages.
 */
class SmsLog extends Model
{
    protected $fillable = [
        'message',
        'to',
        'type',              // otp | promotion | campaign | transactional
        'status',            // queued | sent | failed | demo
        'encoding',          // gsm7 | ucs2
        'segments',
        'cost_estimate_mvr',
        'gateway_response',
        'error_message',
        'provider',
        'customer_id',
        'campaign_id',
        'reference_type',    // model class or context e.g. 'otp', 'App\Models\Order'
        'reference_id',      // id of the related record
        'idempotency_key',
        'sent_at',
    ];

    protected $casts = [
        'gateway_response' => 'array',
        'cost_estimate_mvr' => 'decimal:2',
        'sent_at' => 'datetime',
        'segments' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(SmsCampaign::class, 'campaign_id');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeOfType($query, string $type)
    {
        return $query->where('type', $type);
    }

    public function scopeByPhone($query, string $phone)
    {
        return $query->where('to', $phone);
    }

    public function scopeSent($query)
    {
        return $query->where('status', 'sent');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }
}
