<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Money on its way into a customer's wallet by card (owner, 2026-10-21).
 * Started in the order app or sent as a link by staff; the card payment
 * points at it (payments.wallet_topup_id) and the settle writes the ledger
 * row (ledger_id). Its page is /wallet/top-up/{token}.
 */
class WalletTopUp extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_CANCELLED = 'cancelled';

    public const SOURCE_APP = 'app';

    public const SOURCE_LINK = 'link';

    protected $table = 'wallet_topups';

    protected $fillable = [
        'customer_id',
        'token',
        'amount_laar',
        'amount_fixed',
        'status',
        'source',
        'created_by_user_id',
        'payment_id',
        'ledger_id',
        'note',
        'link_sent_at',
        'paid_at',
        'expires_at',
    ];

    protected $casts = [
        'amount_laar' => 'integer',
        'amount_fixed' => 'boolean',
        'link_sent_at' => 'datetime',
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
        return $this->belongsTo(CustomerDepositLedger::class, 'ledger_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** Still waiting for a payment, and not past its date. */
    public function isOpen(): bool
    {
        return $this->status === self::STATUS_PENDING
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    public function url(): string
    {
        return rtrim((string) config('app.url'), '/') . '/wallet/top-up/' . $this->token;
    }

    /** What the page and the texts call it. */
    public function number(): string
    {
        return 'W-' . str_pad((string) $this->id, 5, '0', STR_PAD_LEFT);
    }
}
