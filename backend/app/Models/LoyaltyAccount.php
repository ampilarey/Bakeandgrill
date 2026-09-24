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

    protected $casts = [
        'customer_id' => 'integer',
        'points_balance' => 'integer',
        'points_held' => 'integer',
        'lifetime_points' => 'integer',
    ];

    /**
     * The customers table carries a copy of the balance and tier
     * (`loyalty_points`, `tier`) that the admin customer list, the POS
     * search and the login payload read. It was written once at sign-up
     * and never again (audit, 2026-09-24), so those screens showed zero
     * and bronze for everyone. Every save of the account now copies the
     * two values across; the repository's raw updates call it too.
     */
    protected static function booted(): void
    {
        static::saved(function (LoyaltyAccount $account): void {
            $account->mirrorToCustomer();
        });
    }

    public function mirrorToCustomer(): void
    {
        Customer::withTrashed()
            ->whereKey($this->customer_id)
            ->update(['loyalty_points' => (int) $this->points_balance, 'tier' => (string) $this->tier]);
    }

    public static function mirrorCustomer(int $customerId): void
    {
        static::query()->where('customer_id', $customerId)->first()?->mirrorToCustomer();
    }

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
