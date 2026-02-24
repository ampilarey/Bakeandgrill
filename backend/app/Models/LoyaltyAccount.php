<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoyaltyAccount extends Model
{
    protected $fillable = [
        'customer_id',
        'points_balance',
        'points_held',
        'lifetime_points',
        'tier',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(LoyaltyLedger::class, 'customer_id', 'customer_id');
    }

    public function holds(): HasMany
    {
        return $this->hasMany(LoyaltyHold::class, 'customer_id', 'customer_id');
    }

    /**
     * Available (non-held) points.
     */
    public function availablePoints(): int
    {
        return max(0, $this->points_balance - $this->points_held);
    }
}
