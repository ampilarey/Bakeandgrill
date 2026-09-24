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
        'ab_test_enabled',
        'message_variant_b',
        'ab_split_percent',
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
        'schedule_id',
    ];

    protected $casts = [
        'ab_test_enabled' => 'boolean',
        'ab_split_percent' => 'integer',
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

    /** The recurring campaign this run came from, if any. */
    public function schedule(): BelongsTo
    {
        return $this->belongsTo(SmsCampaignSchedule::class, 'schedule_id');
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

    public function messageForVariant(string $variant): string
    {
        if ($variant === 'b' && $this->ab_test_enabled && filled($this->message_variant_b)) {
            return $this->message_variant_b;
        }

        return $this->message;
    }

    /** @return array<string, array{sent: int, failed: int, pending: int, delivery_rate: float}> */
    public function computeAbStats(): array
    {
        if (!$this->ab_test_enabled) {
            return [];
        }

        $stats = [];
        foreach (['a', 'b'] as $variant) {
            $base = $this->recipients()->where('variant', $variant);
            $sent = (clone $base)->where('status', 'sent')->count();
            $failed = (clone $base)->where('status', 'failed')->count();
            $pending = (clone $base)->where('status', 'pending')->count();
            $done = $sent + $failed;

            $stats[$variant] = [
                'sent' => $sent,
                'failed' => $failed,
                'pending' => $pending,
                'delivery_rate' => $done > 0 ? round(($sent / $done) * 100, 1) : 0.0,
            ];
        }

        return $stats;
    }

    /**
     * Did it work? Recipients who placed a paid order in the days after the
     * send, the orders they placed and what those took (SMS audit follow-up,
     * 2026-09-24). Null before the campaign has started. A paid order is one
     * with paid_at set that was not cancelled or refunded, the CRM's
     * definition. `complete` says whether the window has closed, so a figure
     * from yesterday's campaign is read as "so far".
     *
     * @return array{window_days: int, buyers: int, orders: int, revenue_mvr: float, buyer_rate: float, reached: int, complete: bool}|null
     */
    public function results(int $windowDays = 7): ?array
    {
        if ($this->started_at === null) {
            return null;
        }
        $from = $this->started_at;
        $to = $this->started_at->copy()->addDays($windowDays);
        $reached = (int) $this->recipients()->whereNotNull('customer_id')->whereIn('status', ['sent'])->count();

        $row = \App\Domains\Customers\Support\CustomerPaidOrderQuery::base()
            ->whereIn('customer_id', $this->recipients()->whereNotNull('customer_id')->where('status', 'sent')->select('customer_id'))
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('COUNT(DISTINCT customer_id) as buyers, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue')
            ->first();
        $buyers = (int) ($row->buyers ?? 0);

        return [
            'window_days' => $windowDays,
            'buyers' => $buyers,
            'orders' => (int) ($row->orders ?? 0),
            'revenue_mvr' => round((float) ($row->revenue ?? 0), 2),
            'buyer_rate' => $reached > 0 ? round($buyers / $reached * 100, 1) : 0.0,
            'reached' => $reached,
            'complete' => now()->gt($to),
        ];
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
