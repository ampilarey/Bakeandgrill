<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Shift extends Model
{
    protected $fillable = [
        'user_id',
        'device_id',
        'opened_at',
        'closed_at',
        'opening_cash',
        'opening_float_expected',
        'opening_float_variance',
        'opening_count_method',
        'opening_count_breakdown',
        'closing_cash',
        'expected_cash',
        'variance',
        'cash_count_method',
        'cash_count_breakdown',
        'foreign_currency_held',
        'notes',
        'force_closed_at',
        'force_closed_by',
    ];

    protected $casts = [
        'force_closed_at' => 'datetime',
        'force_closed_by' => 'integer',
        'user_id' => 'integer',
        'device_id' => 'integer',
        'opening_cash' => 'decimal:2',
        'opening_float_expected' => 'decimal:2',
        'opening_float_variance' => 'decimal:2',
        'closing_cash' => 'decimal:2',
        'expected_cash' => 'decimal:2',
        'variance' => 'decimal:2',
        'cash_count_breakdown' => 'array',
        'opening_count_breakdown' => 'array',
        'foreign_currency_held' => 'array',
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    /** The manager or owner who force-closed this shift, when it was not counted. */
    public function forceCloser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'force_closed_by');
    }

    public function cashMovements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    public function cashCountAttempts(): HasMany
    {
        return $this->hasMany(ShiftCashCountAttempt::class)->orderBy('attempt_number');
    }
}
