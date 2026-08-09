<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One blind cash count of a shift's drawer — either a review (recorded when
 * the cashier taps "Review & close") or the accepted count stored at close.
 */
class ShiftCashCountAttempt extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'shift_id',
        'user_id',
        'attempt_number',
        'cash_count_method',
        'counted_cash',
        'expected_cash',
        'variance',
        'breakdown',
        'is_accepted',
    ];

    protected $casts = [
        'shift_id' => 'integer',
        'user_id' => 'integer',
        'attempt_number' => 'integer',
        'counted_cash' => 'decimal:2',
        'expected_cash' => 'decimal:2',
        'variance' => 'decimal:2',
        'breakdown' => 'array',
        'is_accepted' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
