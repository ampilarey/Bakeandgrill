<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'idempotency_key',
        'order_id',
        'invoice_id',
        'wallet_topup_id',
        'credit_payment_id',
        'collected_by_user_id',
        'shift_id',
        'method',
        'original_method',
        'tender_corrected_at',
        'tender_corrected_by',
        'tender_correction_reason',
        'gateway',
        'currency',
        'amount',
        'tendered_amount',
        'change_given',
        'amount_laar',
        'commission_laar',
        'commission_rate_bp',
        'commission_channel',
        'local_id',
        'provider_transaction_id',
        'status',
        'reference_number',
        'gateway_response',
        'processed_at',
        'check_status',
        'checked_amount_laar',
        'check_reference',
        'check_note',
        'checked_by',
        'checked_at',
    ];

    /** The QR and card check is Admin's (PaymentChecks); the till's payment replies stay as they were. */
    protected $hidden = ['check_status', 'checked_amount_laar', 'check_reference', 'check_note', 'checked_by', 'checked_at'];

    protected $casts = [
        'order_id' => 'integer',
        'invoice_id' => 'integer',
        'wallet_topup_id' => 'integer',
        'credit_payment_id' => 'integer',
        'collected_by_user_id' => 'integer',
        'shift_id' => 'integer',
        'amount' => 'decimal:2',
        'tendered_amount' => 'decimal:2',
        'change_given' => 'decimal:2',
        'amount_laar' => 'integer',
        'commission_laar' => 'integer',
        'commission_rate_bp' => 'integer',
        'gateway_response' => 'array',
        'processed_at' => 'datetime',
        'tender_corrected_at' => 'datetime',
        'tender_corrected_by' => 'integer',
        'checked_amount_laar' => 'integer',
        'checked_by' => 'integer',
        'checked_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /** Money into a customer's wallet by card (owner, 2026-10-21); no order, no invoice. */
    public function walletTopUp(): BelongsTo
    {
        return $this->belongsTo(WalletTopUp::class, 'wallet_topup_id');
    }

    /** The credit account paid online as a whole (owner, 2026-10-21); no order, no invoice. */
    public function creditPayment(): BelongsTo
    {
        return $this->belongsTo(CreditPayment::class, 'credit_payment_id');
    }

    public function collectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collected_by_user_id');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function commissionExpense(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Expense::class);
    }
}
