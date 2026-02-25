<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bulk SMS campaign targeting a segment of customers.
 * Status flow: draft → running → completed / cancelled
 */
class SmsCampaign extends Model
{
    protected $fillable = [
        'name',
        'message',
        'notes',
        'status',
        'target_criteria',
        'total_recipients',
        'sent_count',
        'failed_count',
        'total_cost_mvr',
        'scheduled_at',
        'started_at',
        'completed_at',
        'created_by',
    ];

    protected $casts = [
        'target_criteria' => 'array',
        'total_cost_mvr' => 'decimal:2',
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(SmsCampaignRecipient::class, 'campaign_id');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(SmsLog::class, 'campaign_id');
    }

    // ── Computed Attributes ───────────────────────────────────────────────────

    public function getDeliveryRateAttribute(): float
    {
        if ($this->sent_count === 0) {
            return 0.0;
        }

        return round((($this->sent_count - $this->failed_count) / $this->sent_count) * 100, 1);
    }

    public function getProgressAttribute(): float
    {
        if ($this->total_recipients === 0) {
            return 0.0;
        }

        return round(($this->sent_count / $this->total_recipients) * 100, 1);
    }

    // ── State Helpers ─────────────────────────────────────────────────────────

    public function canStart(): bool
    {
        return $this->status === 'draft';
    }

    public function canCancel(): bool
    {
        return in_array($this->status, ['draft', 'scheduled', 'running'], true);
    }

    public function markStarted(): void
    {
        $this->update(['status' => 'running', 'started_at' => now()]);
    }

    public function markCompleted(): void
    {
        $this->update(['status' => 'completed', 'completed_at' => now()]);
    }

    public function markCancelled(): void
    {
        $this->update(['status' => 'cancelled', 'completed_at' => now()]);
    }

    public function updateStats(): void
    {
        $sent = $this->recipients()->whereIn('status', ['sent', 'failed'])->count();
        $failed = $this->recipients()->where('status', 'failed')->count();
        $cost = $this->recipients()->sum('cost_mvr');

        $this->update([
            'sent_count' => $sent,
            'failed_count' => $failed,
            'total_cost_mvr' => $cost,
        ]);

        if ($sent >= $this->total_recipients && $this->status === 'running') {
            $this->markCompleted();
        }
    }
}
