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
        'closing_cash',
        'expected_cash',
        'variance',
        'cash_count_method',
        'cash_count_breakdown',
        'foreign_currency_held',
        'notes',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'device_id' => 'integer',
        'opening_cash' => 'decimal:2',
        'closing_cash' => 'decimal:2',
        'expected_cash' => 'decimal:2',
        'variance' => 'decimal:2',
        'cash_count_breakdown' => 'array',
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

    public function cashMovements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    public function cashCountAttempts(): HasMany
    {
        return $this->hasMany(ShiftCashCountAttempt::class)->orderBy('attempt_number');
    }
}
