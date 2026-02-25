<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsCampaignRecipient extends Model
{
    protected $fillable = [
        'campaign_id',
        'customer_id',
        'phone',
        'name',
        'status',           // pending | sent | failed
        'failure_reason',
        'cost_mvr',
        'sms_log_id',
        'sent_at',
    ];

    protected $casts = [
        'cost_mvr' => 'decimal:4',
        'sent_at' => 'datetime',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(SmsCampaign::class, 'campaign_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function smsLog(): BelongsTo
    {
        return $this->belongsTo(SmsLog::class);
    }

    public function markSent(SmsLog $log): void
    {
        $this->update([
            'status' => 'sent',
            'sms_log_id' => $log->id,
            'cost_mvr' => $log->cost_estimate_mvr,
            'sent_at' => now(),
        ]);
    }

    public function markFailed(string $reason, ?SmsLog $log = null): void
    {
        $this->update([
            'status' => 'failed',
            'failure_reason' => $reason,
            'sms_log_id' => $log?->id,
            'sent_at' => now(),
        ]);
    }
}
