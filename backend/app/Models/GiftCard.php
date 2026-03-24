<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GiftCard extends Model
{
    protected $fillable = ['code', 'initial_balance', 'current_balance', 'issued_to_customer_id', 'purchased_by_customer_id', 'status', 'expires_at'];
    protected $casts    = ['initial_balance' => 'decimal:2', 'current_balance' => 'decimal:2', 'expires_at' => 'date'];

    /**
     * Hide the raw code from default JSON serialisation to prevent accidental
     * exposure in API responses that don't explicitly need it. The admin
     * GiftCardController uses a manual format() array that includes the code
     * directly, so admin endpoints are unaffected.
     */
    protected $hidden = ['code'];

    /**
     * Returns the last 4 characters of each code segment for safe display.
     * e.g. "ABCD-EFGH-WXYZ" → "****-****-WXYZ"
     */
    public function getMaskedCodeAttribute(): string
    {
        if (empty($this->attributes['code'])) {
            return '****-****-****';
        }

        $segments = explode('-', $this->attributes['code']);

        return implode('-', array_map(
            fn (string $seg) => str_repeat('*', max(0, strlen($seg) - 4)) . substr($seg, -4),
            $segments,
        ));
    }

    public function issuedTo(): BelongsTo     { return $this->belongsTo(Customer::class, 'issued_to_customer_id'); }
    public function purchasedBy(): BelongsTo  { return $this->belongsTo(Customer::class, 'purchased_by_customer_id'); }
    public function transactions(): HasMany   { return $this->hasMany(GiftCardTransaction::class); }
}
