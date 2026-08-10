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
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'payment_terms_days' => 'integer',
            'default_discount_bp' => 'integer',
            'delivery_days' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function priceListEntries(): HasMany
    {
        return $this->hasMany(TradePriceListEntry::class);
    }

    /**
     * Days until payment is due. When unset on the account, use the
     * customer's credit payment terms (default 30).
     */
    public function resolvedPaymentTermsDays(): int
    {
        if ($this->payment_terms_days !== null) {
            return (int) $this->payment_terms_days;
        }

        $fromCustomer = $this->customer?->credit_payment_terms_days;

        return $fromCustomer !== null ? (int) $fromCustomer : 30;
    }
}
