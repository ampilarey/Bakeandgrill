<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GiftCard extends Model
{
    protected $fillable = [
        'code_hash',
        'code_last4',
        'initial_balance',
        'current_balance',
        'issued_to_customer_id',
        'purchased_by_customer_id',
        'status',
        'expires_at',
    ];

    protected $casts = [
        'initial_balance' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'expires_at' => 'date',
    ];

    protected $hidden = ['code_hash'];

    /**
     * Masked display code, e.g. "****-****-WXYZ".
     */
    public function getMaskedCodeAttribute(): string
    {
        $last4 = (string) ($this->attributes['code_last4'] ?? '');

        return $last4 !== '' ? '****-****-' . $last4 : '****-****-****';
    }

    public function issuedTo(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'issued_to_customer_id');
    }

    public function purchasedBy(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'purchased_by_customer_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(GiftCardTransaction::class);
    }

    public function balanceLaar(): int
    {
        return (int) round((float) $this->current_balance * 100);
    }

    public function setBalanceLaar(int $laar): void
    {
        $laar = max(0, $laar);
        $this->current_balance = round($laar / 100, 2);
        if ($laar <= 0 && $this->status === 'active') {
            $this->status = 'depleted';
        } elseif ($laar > 0 && $this->status === 'depleted') {
            $this->status = 'active';
        }
    }
}
