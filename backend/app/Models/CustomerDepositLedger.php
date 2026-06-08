<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerDepositLedger extends Model
{
    protected $table = 'customer_deposit_ledger';

    protected $casts = [
        'amount_laar' => 'integer',
        'balance_before_laar' => 'integer',
        'balance_after_laar' => 'integer',
    ];

    protected $fillable = [
        'customer_id',
        'deposit_account_id',
        'type',
        'method',
        'amount_laar',
        'balance_before_laar',
        'balance_after_laar',
        'order_id',
        'payment_id',
        'refund_id',
        'shift_id',
        'actor_user_id',
        'notes',
        'reference',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function depositAccount(): BelongsTo
    {
        return $this->belongsTo(CustomerDepositAccount::class, 'deposit_account_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function refund(): BelongsTo
    {
        return $this->belongsTo(Refund::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
