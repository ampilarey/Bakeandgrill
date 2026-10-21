<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Money on its way onto a customer's credit account by card (owner,
 * 2026-10-21): the whole balance, or part of it, paid from the order app's
 * Credit panel or the statement page. The card payment points at it
 * (payments.credit_payment_id) and the settle writes the repayment
 * (ledger_id), oldest invoices first.
 */
class CreditPayment extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_CANCELLED = 'cancelled';

    public const SOURCE_APP = 'app';

    public const SOURCE_STATEMENT = 'statement';

    protected $fillable = [
        'customer_id',
        'token',
        'amount_laar',
        'status',
        'source',
        'payment_id',
        'ledger_id',
        'paid_at',
        'expires_at',
    ];

    protected $casts = [
        'amount_laar' => 'integer',
        'paid_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public static function newToken(): string
    {
        return Str::random(48);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(CustomerCreditLedger::class, 'ledger_id');
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_PENDING
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    public function number(): string
    {
        return 'CP-' . str_pad((string) $this->id, 5, '0', STR_PAD_LEFT);
    }
}
