<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TradeDelivery extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_DISPATCHED = 'dispatched';

    public const STATUS_RECONCILED = 'reconciled';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_INVOICED = 'invoiced';

    public const STATUS_SETTLED = 'settled';

    protected $fillable = [
        'trade_account_id',
        'delivery_number',
        'status',
        'dispatched_at',
        'dispatched_by',
        'driver_name',
        'expected_return_at',
        'reconciled_at',
        'reconciled_by',
        'invoiced_at',
        'notes',
        'signature_media_id',
        'idempotency_key',
        'has_mismatch',
        'mismatch_resolved_at',
        'mismatch_resolved_by',
        'mismatch_resolution_notes',
        'missing_charge_waived',
        'missing_waive_reason',
        'missing_waived_by',
        'self_reconciled',
        'reported_by',
        'reported_at',
        'credit_override_reason',
        'credit_override_by',
    ];

    protected function casts(): array
    {
        return [
            'dispatched_at' => 'datetime',
            'expected_return_at' => 'datetime',
            'reconciled_at' => 'datetime',
            'reported_at' => 'datetime',
            'invoiced_at' => 'datetime',
            'mismatch_resolved_at' => 'datetime',
            'has_mismatch' => 'boolean',
            'self_reconciled' => 'boolean',
            'missing_charge_waived' => 'boolean',
        ];
    }

    public function mismatchIsBlocking(): bool
    {
        return (bool) $this->has_mismatch && $this->mismatch_resolved_at === null;
    }

    public function tradeAccount(): BelongsTo
    {
        return $this->belongsTo(TradeAccount::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(TradeDeliveryLine::class);
    }

    public function dispatcher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by');
    }

    public function reconciler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reconciled_by');
    }

    public function isImmutable(): bool
    {
        return in_array($this->status, [
            self::STATUS_DISPATCHED,
            self::STATUS_RECONCILED,
            self::STATUS_INVOICED,
            self::STATUS_SETTLED,
        ], true);
    }

    public function stampedValueLaar(): int
    {
        return (int) $this->lines->sum(fn (TradeDeliveryLine $line) => $line->qty_sent * $line->unit_price_laar);
    }
}
