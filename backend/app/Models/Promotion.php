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
        'registered_only',
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
        'order_channels',
        'order_types',
        'metadata',
        'restricted_customer_id',
        'budget_laar',
        'spent_laar',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'auto_apply' => 'boolean',
        'first_order_only' => 'boolean',
        'registered_only' => 'boolean',
        'waive_delivery' => 'boolean',
        'stackable' => 'boolean',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'days_of_week' => 'array',
        'order_channels' => 'array',
        'order_types' => 'array',
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

    /** Where an order was placed: rung up by staff, or placed by the customer in the order app. */
    public const CHANNELS = ['till', 'online'];

    /** The order types an offer can be limited to. */
    public const ORDER_TYPES = ['dine_in', 'takeaway', 'online_pickup', 'delivery'];

    private const TYPE_WORDS = ['dine_in' => 'dine-in', 'takeaway' => 'takeaway', 'online_pickup' => 'pickup', 'delivery' => 'delivery'];

    /** @return list<string> the channels it is for, empty for all */
    public function channelLimits(): array
    {
        $v = array_values(array_intersect(self::CHANNELS, (array) ($this->order_channels ?? [])));

        return count($v) === count(self::CHANNELS) ? [] : $v;
    }

    /** @return list<string> the order types it is for, empty for all */
    public function typeLimits(): array
    {
        $v = array_values(array_intersect(self::ORDER_TYPES, (array) ($this->order_types ?? [])));

        return count($v) === count(self::ORDER_TYPES) ? [] : $v;
    }

    /** Limited to some orders: never baked into menu prices, which every order sees. */
    public function isLimitedToSomeOrders(): bool
    {
        return $this->channelLimits() !== [] || $this->typeLimits() !== [];
    }

    /**
     * Why this order may not have the offer, or null when it may (owner, 2026-11-08). A cart whose
     * channel or type is not known yet (the till before the cashier picks a type) does not get a
     * limited offer: it shows once the type is picked.
     */
    public function orderLimitRejection(?string $channel, ?string $type): ?string
    {
        $channels = $this->channelLimits();
        if ($channels !== [] && ($channel === null || !in_array($channel, $channels, true))) {
            return $channels === ['online']
                ? 'This offer is for orders placed in the app only.'
                : 'This offer is for orders at the counter only.';
        }
        $types = $this->typeLimits();
        if ($types !== [] && ($type === null || !in_array($type, $types, true))) {
            return 'This offer is for ' . $this->typeWords($types) . ' orders only.';
        }

        return null;
    }

    /** "Dine-in only", "App orders only · delivery", or null for every order. */
    public function orderLimitLabel(): ?string
    {
        $parts = [];
        $channels = $this->channelLimits();
        if ($channels !== []) {
            $parts[] = $channels === ['online'] ? 'App orders' : 'At the counter';
        }
        $types = $this->typeLimits();
        if ($types !== []) {
            $parts[] = $this->typeWords($types);
        }
        if ($parts === []) {
            return null;
        }
        $label = implode(' · ', $parts) . ' only';

        return mb_strtoupper(mb_substr($label, 0, 1)) . mb_substr($label, 1);
    }

    /** @param list<string> $types */
    private function typeWords(array $types): string
    {
        $words = array_map(static fn (string $t): string => self::TYPE_WORDS[$t] ?? $t, $types);
        if (count($words) <= 1) {
            return $words[0] ?? '';
        }
        $last = array_pop($words);

        return implode(', ', $words) . ' and ' . $last;
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

        // A budget that is fully spent ends the offer, so the menus stop
        // advertising a discount the order would no longer give (2026-10-01).
        if ($this->budget_laar !== null && (int) ($this->spent_laar ?? 0) >= (int) $this->budget_laar) {
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

        $start = $this->starts_time;
        $end = $this->ends_time;
        $startStr = $start ? (is_string($start) ? $start : (string) $start) : null;
        $endStr = $end ? (is_string($end) ? $end : (string) $end) : null;
        $current = $now->format('H:i:s');
        $overnight = $startStr !== null && $endStr !== null && $startStr > $endStr;

        // The day a window belongs to is the day it opened: "Friday 22:00 to 02:00" is still
        // Friday's at 01:00 on Saturday (discount audit, 2026-11-10; it used to stop at midnight).
        $day = (int) $now->dayOfWeek;
        if ($overnight && $current <= $endStr) {
            $day = ($day + 6) % 7;
        }

        $days = $this->days_of_week;
        if (is_array($days) && $days !== [] && !in_array($day, array_map('intval', $days), true)) {
            return false;
        }

        if ($startStr !== null && $endStr !== null) {
            if (!$overnight) {
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
