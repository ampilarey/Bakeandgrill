<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TradeAccount extends Model
{
    public const SETTLEMENT_SALE_OR_RETURN = 'sale_or_return';

    public const SETTLEMENT_FIRM_SALE = 'firm_sale';

    public const BILLING_WEEKLY = 'weekly';

    public const BILLING_FORTNIGHTLY = 'fortnightly';

    public const BILLING_MONTHLY = 'monthly';

    public const BILLING_PER_DELIVERY = 'per_delivery';

    public const MISSING_CHARGE = 'charge';

    public const MISSING_WRITE_OFF = 'write_off';

    public const MISSING_DISPUTE = 'dispute';

    protected $fillable = [
        'customer_id',
        'shop_name',
        'contact_name',
        'contact_phone',
        'settlement_mode',
        'billing_cycle',
        'payment_terms_days',
        'missing_policy',
        'default_discount_bp',
        'delivery_days',
        'billing_reminded_at',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'payment_terms_days' => 'integer',
            'default_discount_bp' => 'integer',
            'delivery_days' => 'array',
            'billing_reminded_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    /** Days between invoices for this account's billing cycle (0 = after every delivery). */
    public function billingCycleDays(): int
    {
        return match ($this->billing_cycle) {
            self::BILLING_WEEKLY => 7,
            self::BILLING_FORTNIGHTLY => 14,
            self::BILLING_MONTHLY => 30,
            default => 0,
        };
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function priceListEntries(): HasMany
    {
        return $this->hasMany(TradePriceListEntry::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(TradeDelivery::class);
    }

    /**
     * Days until payment is due. When unset on the account, use the
     * customer's credit payment terms (default 30). Held to the same 7–90
     * day range the customer's terms allow (wholesale audit, 2026-09-26).
     */
    public function resolvedPaymentTermsDays(): int
    {
        $days = $this->payment_terms_days !== null
            ? (int) $this->payment_terms_days
            : (int) ($this->customer?->credit_payment_terms_days ?? 30);

        return max(7, min(90, $days));
    }
}
