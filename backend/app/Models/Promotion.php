<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Promotion extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'code',
        'type',
        'discount_value',
        'is_active',
        'starts_at',
        'expires_at',
        'max_uses',
        'max_uses_per_customer',
        'redemptions_count',
        'stackable',
        'min_order_laar',
        'scope',
        'metadata',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'stackable' => 'boolean',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'metadata' => 'array',
    ];

    /**
     * Normalize code to uppercase on save.
     */
    protected static function booted(): void
    {
        static::creating(function (self $promo): void {
            $promo->code = strtoupper(trim($promo->code));
        });

        static::updating(function (self $promo): void {
            if ($promo->isDirty('code')) {
                $promo->code = strtoupper(trim($promo->code));
            }
        });
    }

    public function targets(): HasMany
    {
        return $this->hasMany(PromotionTarget::class);
    }

    public function orderPromotions(): HasMany
    {
        return $this->hasMany(OrderPromotion::class);
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(PromotionRedemption::class);
    }

    public function isValid(): bool
    {
        if (!$this->is_active) {
            return false;
        }

        $now = now();

        if ($this->starts_at && $this->starts_at->isAfter($now)) {
            return false;
        }

        if ($this->expires_at && $this->expires_at->isBefore($now)) {
            return false;
        }

        if ($this->max_uses && $this->redemptions_count >= $this->max_uses) {
            return false;
        }

        return true;
    }
}
