<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Promotion extends Model
{
    use SoftDeletes;

    /** @var list<string> */
    public const TYPES = [
        'percentage',
        'fixed',
        'free_item',
        'tiered',
        'quantity_break',
        'buy_x_get_y',
        'free_delivery',
    ];

    protected $fillable = [
        'name',
        'code',
        'type',
        'discount_value',
        'is_active',
        'auto_apply',
        'first_order_only',
        'waive_delivery',
        'starts_at',
        'expires_at',
        'days_of_week',
        'starts_time',
        'ends_time',
        'max_uses',
        'max_uses_per_customer',
        'stackable',
        'min_order_laar',
        'scope',
        'metadata',
        'restricted_customer_id',
        'budget_laar',
        'spent_laar',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'auto_apply' => 'boolean',
        'first_order_only' => 'boolean',
        'waive_delivery' => 'boolean',
        'stackable' => 'boolean',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'days_of_week' => 'array',
        'metadata' => 'array',
        'discount_value' => 'integer',
        'min_order_laar' => 'integer',
        'max_uses' => 'integer',
        'max_uses_per_customer' => 'integer',
        'redemptions_count' => 'integer',
        'budget_laar' => 'integer',
        'spent_laar' => 'integer',
    ];

    /**
     * Normalize code to uppercase on save.
     * Auto-apply promos store null code on MySQL/Postgres; on SQLite (NOT NULL)
     * they get a unique AUTO-* sentinel so coded lookup never matches customer input.
     */
    protected static function booted(): void
    {
        static::saving(function (self $promo): void {
            if ($promo->auto_apply) {
                $promo->restricted_customer_id = null;
                if ($promo->code === null || $promo->code === '') {
                    $driver = $promo->getConnection()->getDriverName();
                    $promo->code = $driver === 'sqlite'
                        ? 'AUTO-' . strtoupper(bin2hex(random_bytes(5)))
                        : null;
                } else {
                    $promo->code = strtoupper(trim((string) $promo->code));
                }

                return;
            }

            if ($promo->code !== null && $promo->code !== '') {
                $promo->code = strtoupper(trim((string) $promo->code));
            } elseif ($promo->isDirty('code')) {
                $promo->code = null;
            }
        });

        static::saved(function (): void {
            try {
                app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();
                app(\App\Domains\Promotions\Services\OffersService::class)->bustCache();
            } catch (\Throwable) {
                // Ignore during early boot / migrations.
            }
        });

        static::deleted(function (): void {
            try {
                app(\App\Domains\Promotions\Services\AutoPromotionPricing::class)->bustCache();
                app(\App\Domains\Promotions\Services\OffersService::class)->bustCache();
            } catch (\Throwable) {
                // Ignore during early boot / migrations.
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

    public function scopeActive(Builder $query): Builder
    {
        $now = now();

        return $query->where('is_active', true)
            ->where(function (Builder $q) use ($now): void {
                $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now);
            })
            ->where(function (Builder $q) use ($now): void {
                $q->whereNull('expires_at')->orWhere('expires_at', '>=', $now);
            });
    }

    public function scopeAutoApply(Builder $query): Builder
    {
        return $query->where('auto_apply', true)->whereNull('restricted_customer_id');
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

        if (!$this->matchesScheduleWindow($now)) {
            return false;
        }

        return true;
    }

    /**
     * Optional days_of_week + time window (happy hour). Empty = always in window.
     */
    public function matchesScheduleWindow(?\DateTimeInterface $now = null): bool
    {
        $now = $now ? \Carbon\Carbon::instance(\DateTimeImmutable::createFromInterface($now)) : now();

        $days = $this->days_of_week;
        if (is_array($days) && $days !== []) {
            // Accept 0-6 (Sun-Sat) or 1-7 (Mon-Sun) — store as Carbon dayOfWeek (0=Sun).
            $today = (int) $now->dayOfWeek;
            $normalized = array_map('intval', $days);
            if (!in_array($today, $normalized, true)) {
                return false;
            }
        }

        $start = $this->starts_time;
        $end = $this->ends_time;
        if ($start && $end) {
            $current = $now->format('H:i:s');
            $startStr = is_string($start) ? $start : (string) $start;
            $endStr = is_string($end) ? $end : (string) $end;
            // Support overnight windows (e.g. 22:00–02:00).
            if ($startStr <= $endStr) {
                if ($current < $startStr || $current > $endStr) {
                    return false;
                }
            } elseif ($current < $startStr && $current > $endStr) {
                return false;
            }
        }

        return true;
    }
}
